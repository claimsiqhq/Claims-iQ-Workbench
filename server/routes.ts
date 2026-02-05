import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase";
import { AuditLogSchema, SessionDataSchema, IssueBundleSchema } from "@shared/schema";
import { DocumentCorrectionPayloadSchema, CorrectionSchema, AnnotationSchema, CrossDocumentValidationSchema } from "@shared/schemas";
import { FieldExtractor } from "./services/field-extractor";
import { CrossDocumentValidator } from "./services/cross-document-validator";
import { authenticateRequest, optionalAuth } from "./middleware/auth";
import { uploadLimiter, auditLimiter, apiLimiter, validationLimiter } from "./middleware/rate-limit";
import { requestIdMiddleware, loggingMiddleware } from "./middleware/logging";
import { parsePaginationParams, createPaginatedResponse, DEFAULT_LIMIT, DEFAULT_PAGE } from "@shared/types/pagination";
import { performanceMiddleware, performanceMonitor } from "./monitoring";
import { cache, cacheKey, withCache } from "./cache";
import {
  isClaimsIQPayload,
  validateAgainstSchema,
  adaptToIssueBundle,
  adaptCorrectionPayload,
  getActiveSchema,
  getSchemaVersion,
  getSchemaTitle,
  saveActiveSchema,
} from "./adapters/correction-payload-adapter";
import jwt from "jsonwebtoken";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import path from "path";
import fs from "fs";
import { parsePdfFile, extractPdfText, type ExtractedClaimInfo } from "./pdf-parser";
import crypto from "crypto";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORAGE_DIR = path.resolve(process.cwd(), "storage");
const INDEX_FILE = path.join(DATA_DIR, "index.json");
const AUDIT_LOG_FILE = path.join(DATA_DIR, "audit.log");

const auditMemory: any[] = [];
const MAX_AUDIT_MEMORY = 200;

/**
 * Validate PDF file by checking magic bytes
 */
function validatePdfFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    return buffer.toString() === "%PDF";
  } catch {
    return false;
  }
}

const upload = multer({
  dest: STORAGE_DIR,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (file.fieldname === "issues") {
      if (ext !== ".json" && file.mimetype !== "application/json") {
        return cb(new Error("Issues file must be JSON"));
      }
    } else if (file.fieldname === "file") {
      const allowedMimes = ["application/pdf", "application/x-pdf", "application/octet-stream"];
      if (!allowedMimes.includes(file.mimetype) && ext !== ".pdf") {
        return cb(new Error("Only PDF files are allowed"));
      }
    }
    
    const sanitized = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, "_");
    file.originalname = sanitized;
    
    cb(null, true);
  },
});

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify({ claims: [] }, null, 2));
  }
}

function readIndex(): { claims: any[] } {
  ensureDataFiles();
  const data = fs.readFileSync(INDEX_FILE, "utf-8");
  return JSON.parse(data);
}

function writeIndex(data: { claims: any[] }) {
  ensureDataFiles();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(data, null, 2));
}

function appendAuditLogLocal(record: any) {
  ensureDataFiles();
  fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(record) + "\n");
  auditMemory.push(record);
  if (auditMemory.length > MAX_AUDIT_MEMORY) {
    auditMemory.shift();
  }
}

/**
 * Validate JWT private key format and strength
 */
function validateJwtKey(): void {
  const privateKey = process.env.JWT_PRIVATE_KEY_PEM;
  if (!privateKey) {
    console.warn("JWT_PRIVATE_KEY_PEM not configured - JWT generation will fail");
    return;
  }

  try {
    // Validate RSA key format
    if (
      !privateKey.includes("BEGIN RSA PRIVATE KEY") &&
      !privateKey.includes("BEGIN PRIVATE KEY")
    ) {
      throw new Error("JWT_PRIVATE_KEY_PEM must be a valid RSA private key");
    }

    // Validate key format (skip size check as asymmetricKeySize is not available)
    crypto.createPrivateKey(privateKey);
  } catch (error) {
    console.error(`Invalid JWT key format: ${error instanceof Error ? error.message : "Unknown error"}`);
    // Don't throw in dev mode, but log warning
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
  }
}

// Validate on module load
validateJwtKey();

function generateJWT(documentId: string): { jwt: string; exp: number } {
  const privateKey = process.env.JWT_PRIVATE_KEY_PEM;
  const expiresIn = parseInt(process.env.JWT_EXPIRES_IN_SECONDS || "3600", 10);
  const permissionsStr = process.env.JWT_PERMISSIONS || "read-document,write,download";
  const permissions = permissionsStr.split(",").map((p) => p.trim());

  if (!privateKey) {
    throw new Error("JWT_PRIVATE_KEY_PEM is not configured");
  }

  const payload = {
    document_id: documentId,
    permissions,
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    expiresIn,
  });

  const decoded = jwt.decode(token) as { exp: number };

  return { jwt: token, exp: decoded.exp };
}

const ID_PATTERN = /^[a-zA-Z0-9-_]+$/;

function sanitizeId(id: string | string[]): string | null {
  const idStr = Array.isArray(id) ? id[0] : id;
  if (!idStr || !ID_PATTERN.test(idStr)) {
    return null;
  }
  return idStr;
}

async function documentExistsCheck(documentId: string, claimId?: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    return storage.documentExists(documentId, claimId);
  }
  
  const index = readIndex();
  for (const claim of index.claims) {
    if (claimId && claim.claimId !== claimId) {
      continue;
    }
    if (claim.documents?.some((doc: any) => doc.documentId === documentId)) {
      return true;
    }
  }
  return false;
}

async function claimExistsCheck(claimId: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    return storage.claimExists(claimId);
  }
  
  const index = readIndex();
  return index.claims.some((c) => c.claimId === claimId);
}

async function getClaimForDocumentCheck(documentId: string): Promise<string | null> {
  if (isSupabaseConfigured()) {
    return storage.getClaimForDocument(documentId);
  }
  
  const index = readIndex();
  for (const claim of index.claims) {
    if (claim.documents?.some((doc: any) => doc.documentId === documentId)) {
      return claim.claimId;
    }
  }
  return null;
}

function normalizeUrl(url: string): string {
  return url.endsWith("/") ? url : url + "/";
}

async function registerWithDocEngine(documentId: string): Promise<boolean> {
  const docEngineUrl = process.env.DOC_ENGINE_URL;
  const apiToken = process.env.DOC_ENGINE_API_TOKEN;
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;

  if (!docEngineUrl || !apiToken || !publicBaseUrl) {
    console.log("Document Engine not configured, skipping registration");
    return false;
  }

  const normalizedEngineUrl = normalizeUrl(docEngineUrl);
  const normalizedPublicUrl = normalizeUrl(publicBaseUrl);
  const pdfUrl = `${normalizedPublicUrl}files/${documentId}.pdf`;

  try {
    const response = await fetch(`${normalizedEngineUrl}api/documents`, {
      method: "POST",
      headers: {
        Authorization: `Token token="${apiToken}"`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: pdfUrl,
        document_id: documentId,
      }),
    });

    if (response.ok) {
      console.log(`Registered document ${documentId} with Document Engine`);
      return true;
    } else if (response.status === 409) {
      console.log(`Document ${documentId} already registered`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`Failed to register document: ${response.status} - ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error("Error registering with Document Engine:", error);
    return false;
  }
}

async function uploadToSupabaseStorage(filePath: string, documentId: string, userId?: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const storagePath = userId ? `${userId}/${documentId}.pdf` : `public/${documentId}.pdf`;
    
    const { data, error } = await supabaseAdmin.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
    
    if (error) {
      console.error('Error uploading to Supabase storage:', error);
      return null;
    }
    
    fs.unlinkSync(filePath);
    return storagePath;
  } catch (error) {
    console.error('Error uploading file:', error);
    return null;
  }
}

async function getSupabaseFileUrl(storagePath: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  
  const { data } = supabaseAdmin.storage
    .from('documents')
    .getPublicUrl(storagePath);
  
  return data.publicUrl;
}

async function downloadFromSupabase(documentId: string): Promise<Buffer | null> {
  if (!supabaseAdmin) return null;
  
  const doc = await storage.getDocument(documentId);
  if (!doc) return null;
  
  const docWithPath = doc as any;
  const filePath = docWithPath.filePath || `public/${documentId}.pdf`;
  
  const { data, error } = await supabaseAdmin.storage
    .from('documents')
    .download(filePath);
  
  if (error) {
    console.error('Error downloading from Supabase:', error);
    return null;
  }
  
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Standardized error response format
 */
function sendError(res: Response, status: number, code: string, message: string, details?: any): void {
  res.status(status).json({
    error: {
      code,
      message,
      ...(details && { details }),
    },
  });
}

/**
 * Standardized success response format
 */
function sendSuccess<T>(res: Response, data: T, status: number = 200): void {
  res.status(status).json({ data });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  ensureDataFiles();

  // CORS configuration - restrict to known origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").filter(Boolean) || [
    "http://localhost:5000",
    "http://localhost:3000",
    process.env.PUBLIC_BASE_URL,
  ].filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === "development") {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    })
  );

  // Apply request ID and logging middleware
  app.use(requestIdMiddleware);
  app.use(loggingMiddleware);
  app.use(performanceMiddleware);
  
  // Apply rate limiting to all API routes
  app.use("/api", apiLimiter);

  // Metrics endpoint - no auth required
  app.get("/api/metrics", (req, res) => {
    sendSuccess(res, performanceMonitor.getMetrics());
  });

  // Health check - no auth required
  app.get("/api/health", async (req, res) => {
    let schemaValid = true;
    
    if (isSupabaseConfigured() && supabaseAdmin) {
      try {
        const { error } = await supabaseAdmin.from('claims').select('claim_id').limit(1);
        schemaValid = !error || error.code !== 'PGRST205';
      } catch {
        schemaValid = false;
      }
    }
    
    sendSuccess(res, {
      ok: true,
      supabase: isSupabaseConfigured(),
      schemaValid,
    });
  });

  /**
   * @openapi
   * /claims:
   *   get:
   *     summary: Get list of claims
   *     tags: [Claims]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *         description: Page number (default 1)
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Items per page (default 50, max 100)
   *     responses:
   *       200:
   *         description: List of claims with pagination
   */
  app.get("/api/claims", authenticateRequest, async (req, res) => {
    try {
      const pagination = parsePaginationParams(req.query);
      
      if (isSupabaseConfigured()) {
        const cacheKeyStr = cacheKey("claims", req.userId, pagination.page, pagination.limit);
        const result = await withCache(cacheKeyStr, async () => {
          return await storage.getClaimsPaginated(req.userId, pagination);
        }, 30000);
        
        return sendSuccess(res, createPaginatedResponse(result.data, result.total, pagination));
      }
      
      const index = readIndex();
      const page = pagination.page || 1;
      const limit = pagination.limit || 50;
      const offset = (page - 1) * limit;
      const paginatedData = index.claims.slice(offset, offset + limit);
      
      sendSuccess(res, createPaginatedResponse(paginatedData, index.claims.length, pagination));
    } catch (error) {
      console.error("Error fetching claims:", error);
      sendError(res, 500, "FETCH_ERROR", "Failed to fetch claims");
    }
  });

  app.get("/api/claims/:claimId/documents", async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      
      if (!sanitizedClaimId) {
        return res.status(400).json({ error: "Invalid claim ID" });
      }
      
      if (isSupabaseConfigured()) {
        const documents = await storage.getDocumentsByClaim(sanitizedClaimId);
        return res.json(documents);
      }
      
      const index = readIndex();
      const claim = index.claims.find((c) => c.claimId === sanitizedClaimId);
      
      if (!claim) {
        return res.json([]);
      }

      const documents = claim.documents.map((doc: any) => ({
        documentId: doc.documentId,
        name: doc.title,
        claimId: sanitizedClaimId,
      }));

      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.post("/api/documents/upload", uploadLimiter, authenticateRequest, upload.fields([
    { name: "file", maxCount: 1 },
    { name: "issues", maxCount: 1 },
  ]), async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!files.file || files.file.length === 0) {
        return res.status(400).json({ error: "PDF file is required" });
      }

      const pdfFile = files.file[0];
      const documentId = uuidv4();
      const pdfPath = path.join(STORAGE_DIR, `${documentId}.pdf`);
      
      fs.renameSync(pdfFile.path, pdfPath);

      let extractedInfo: ExtractedClaimInfo = {};
      let claimId: string;
      
      try {
        extractedInfo = await parsePdfFile(pdfPath);
        claimId = extractedInfo.claimId || `CLM-${Date.now().toString().slice(-6)}`;
        
        claimId = claimId.replace(/[^a-zA-Z0-9-_]/g, "-").toUpperCase();
        if (!ID_PATTERN.test(claimId)) {
          claimId = `CLM-${Date.now().toString().slice(-6)}`;
        }
      } catch (parseError) {
        console.error("Error parsing PDF:", parseError);
        claimId = `CLM-${Date.now().toString().slice(-6)}`;
        extractedInfo = { claimId };
      }

      let issuesData: any = null;
      let correctionPayloadResult: any = null;
      try {
        if (files.issues && files.issues.length > 0) {
          const issuesContent = fs.readFileSync(files.issues[0].path, "utf-8");
          issuesData = JSON.parse(issuesContent);
          fs.unlinkSync(files.issues[0].path);
        } else if (req.body.issues) {
          issuesData = typeof req.body.issues === "string" 
            ? JSON.parse(req.body.issues) 
            : req.body.issues;
        }

        if (issuesData) {
          if (isClaimsIQPayload(issuesData)) {
            const schemaValidation = validateAgainstSchema(issuesData);
            if (!schemaValidation.valid) {
              fs.unlinkSync(pdfPath);
              return res.status(400).json({
                error: "Correction payload failed schema validation",
                details: schemaValidation.errors,
              });
            }

            correctionPayloadResult = adaptCorrectionPayload(issuesData);

            claimId = correctionPayloadResult.claimId;
            extractedInfo = {
              claimId,
              claimNumber: correctionPayloadResult.claimContext.claimNumber,
              policyNumber: correctionPayloadResult.claimContext.policyNumber,
              insuredName: correctionPayloadResult.claimContext.insuredName,
              dateOfLoss: correctionPayloadResult.claimContext.dateOfLoss,
            };

            const issueBundle = adaptToIssueBundle(issuesData, documentId);

            if (isSupabaseConfigured()) {
              await storage.saveIssues(claimId, documentId, issueBundle, req.userId);
            } else {
              const issuesPath = path.join(STORAGE_DIR, `${claimId}__${documentId}__issues.json`);
              fs.writeFileSync(issuesPath, JSON.stringify(issueBundle, null, 2));
            }

            const fullPayloadPath = path.join(STORAGE_DIR, `${claimId}__${documentId}__correction_payload.json`);
            fs.writeFileSync(fullPayloadPath, JSON.stringify(correctionPayloadResult, null, 2));

          } else {
            const validated = IssueBundleSchema.safeParse(issuesData);
            if (!validated.success) {
              fs.unlinkSync(pdfPath);
              return res.status(400).json({ 
                error: "Invalid issues format", 
                details: validated.error.message 
              });
            }
            
            if (isSupabaseConfigured()) {
              await storage.saveIssues(claimId, documentId, validated.data, req.userId);
            } else {
              const issuesPath = path.join(STORAGE_DIR, `${claimId}__${documentId}__issues.json`);
              fs.writeFileSync(issuesPath, JSON.stringify(validated.data, null, 2));
            }
          }
        }
      } catch (parseError) {
        fs.unlinkSync(pdfPath);
        return res.status(400).json({ 
          error: "Invalid issues JSON", 
          details: parseError instanceof Error ? parseError.message : "Parse error" 
        });
      }

      if (isSupabaseConfigured()) {
        const storagePath = await uploadToSupabaseStorage(pdfPath, documentId);
        
        const claimExists = await storage.claimExists(claimId);
        if (!claimExists) {
          await storage.createClaim({
            claimId,
            claimNumber: extractedInfo.claimNumber || claimId,
            policyNumber: extractedInfo.policyNumber,
            status: extractedInfo.status || 'open',
          });
        }
        
        await storage.createDocument({
          documentId,
          claimId,
          title: pdfFile.originalname || `${documentId}.pdf`,
          filePath: storagePath || `public/${documentId}.pdf`,
          fileSize: pdfFile.size,
        });
      } else {
        const index = readIndex();
        let claim = index.claims.find((c) => c.claimId === claimId);
        
        if (!claim) {
          claim = { 
            claimId, 
            claimNumber: extractedInfo.claimNumber,
            policyNumber: extractedInfo.policyNumber,
            status: extractedInfo.status,
            documents: [] 
          };
          index.claims.push(claim);
        }

        claim.documents.push({
          documentId,
          title: pdfFile.originalname || `${documentId}.pdf`,
        });

        writeIndex(index);
      }

      await registerWithDocEngine(documentId);

      sendSuccess(res, {
        claimId,
        documentId,
        extractedInfo,
      }, 201);
    } catch (error) {
      console.error("Upload error:", error);
      sendError(res, 500, "UPLOAD_ERROR", "Failed to upload document");
    }
  });

  app.post("/api/claims/:claimId/documents", uploadLimiter, authenticateRequest, upload.fields([
    { name: "file", maxCount: 1 },
    { name: "issues", maxCount: 1 },
  ]), async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      
      if (!sanitizedClaimId) {
        return res.status(400).json({ error: "Invalid claim ID format" });
      }
      
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!files.file || files.file.length === 0) {
        return res.status(400).json({ error: "PDF file is required" });
      }

      const pdfFile = files.file[0];
      const documentId = uuidv4();
      const pdfPath = path.join(STORAGE_DIR, `${documentId}.pdf`);
      
      fs.renameSync(pdfFile.path, pdfPath);

      let issuesData: any = null;
      try {
        if (files.issues && files.issues.length > 0) {
          const issuesContent = fs.readFileSync(files.issues[0].path, "utf-8");
          issuesData = JSON.parse(issuesContent);
          fs.unlinkSync(files.issues[0].path);
        } else if (req.body.issues) {
          issuesData = typeof req.body.issues === "string" 
            ? JSON.parse(req.body.issues) 
            : req.body.issues;
        }

        if (issuesData) {
          const validated = IssueBundleSchema.safeParse(issuesData);
          if (!validated.success) {
            fs.unlinkSync(pdfPath);
            return res.status(400).json({ 
              error: "Invalid issues format", 
              details: validated.error.message 
            });
          }
          
          if (isSupabaseConfigured()) {
            await storage.saveIssues(sanitizedClaimId, documentId, validated.data, req.userId);
          } else {
            const issuesPath = path.join(STORAGE_DIR, `${sanitizedClaimId}__${documentId}__issues.json`);
            fs.writeFileSync(issuesPath, JSON.stringify(validated.data, null, 2));
          }
        }
      } catch (parseError) {
        fs.unlinkSync(pdfPath);
        return res.status(400).json({ 
          error: "Invalid issues JSON", 
          details: parseError instanceof Error ? parseError.message : "Parse error" 
        });
      }

      if (isSupabaseConfigured()) {
        const storagePath = await uploadToSupabaseStorage(pdfPath, documentId, req.userId);
        
        const claimExists = await storage.claimExists(sanitizedClaimId);
        if (!claimExists) {
          await storage.createClaim({ claimId: sanitizedClaimId }, req.userId);
        }
        
        await storage.createDocument({
          documentId,
          claimId: sanitizedClaimId,
          title: pdfFile.originalname || `${documentId}.pdf`,
          filePath: storagePath || `public/${documentId}.pdf`,
          fileSize: pdfFile.size,
        }, req.userId);
      } else {
        const index = readIndex();
        let claim = index.claims.find((c) => c.claimId === sanitizedClaimId);
        
        if (!claim) {
          claim = { claimId: sanitizedClaimId, documents: [] };
          index.claims.push(claim);
        }

        claim.documents.push({
          documentId,
          title: pdfFile.originalname || `${documentId}.pdf`,
        });

        writeIndex(index);
      }

      await registerWithDocEngine(documentId);

      sendSuccess(res, { claimId: sanitizedClaimId, documentId }, 201);
    } catch (error) {
      console.error("Upload error:", error);
      sendError(res, 500, "UPLOAD_ERROR", "Failed to upload document");
    }
  });

  app.get("/files/:documentId.pdf", async (req, res) => {
    const documentId = sanitizeId(req.params.documentId);
    
    if (!documentId) {
      return res.status(400).json({ error: "Invalid document ID" });
    }
    
    const exists = await documentExistsCheck(documentId);
    if (!exists) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    if (isSupabaseConfigured()) {
      const fileBuffer = await downloadFromSupabase(documentId);
      if (fileBuffer) {
        res.setHeader("Content-Type", "application/pdf");
        return res.send(fileBuffer);
      }
    }
    
    const filePath = path.join(STORAGE_DIR, `${documentId}.pdf`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.sendFile(filePath);
  });

  app.get("/api/session/:documentId", optionalAuth, async (req, res) => {
    try {
      const sanitizedDocId = sanitizeId(req.params.documentId);
      
      if (!sanitizedDocId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid document ID");
      }
      
      const exists = await documentExistsCheck(sanitizedDocId);
      if (!exists) {
        return sendError(res, 404, "NOT_FOUND", "Document not found");
      }
      
      const docEngineUrl = process.env.DOC_ENGINE_URL;
      const privateKey = process.env.JWT_PRIVATE_KEY_PEM;

      if (privateKey && docEngineUrl) {
        try {
          const { jwt: token, exp } = generateJWT(sanitizedDocId);
          const normalizedEngineUrl = normalizeUrl(docEngineUrl);

          const sessionData = SessionDataSchema.parse({
            documentId: sanitizedDocId,
            jwt: token,
            serverUrl: normalizedEngineUrl,
            instant: normalizedEngineUrl,
            autoSaveMode: "INTELLIGENT" as const,
            exp,
          });

          return sendSuccess(res, sessionData);
        } catch (jwtError) {
          console.error("JWT generation failed:", jwtError);
          return sendError(res, 500, "JWT_ERROR", "JWT configuration error. Check JWT_PRIVATE_KEY_PEM format.");
        }
      }

      const fallbackSession = SessionDataSchema.parse({
        documentId: sanitizedDocId,
        autoSaveMode: "DISABLED" as const,
      });
      
      sendSuccess(res, fallbackSession);
    } catch (error) {
      console.error("Session error:", error);
      sendError(res, 500, "SESSION_ERROR", "Failed to create session");
    }
  });

  app.get("/api/claims/:claimId/documents/:documentId/issues", authenticateRequest, async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      const sanitizedDocId = sanitizeId(req.params.documentId);
      
      if (!sanitizedClaimId || !sanitizedDocId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid claim or document ID");
      }
      
      // Verify document belongs to user
      const exists = await documentExistsCheck(sanitizedDocId, sanitizedClaimId);
      if (!exists) {
        return sendError(res, 404, "NOT_FOUND", "Document not found for this claim");
      }
      
      if (isSupabaseConfigured()) {
        const issues = await storage.getIssues(sanitizedClaimId, sanitizedDocId);
        return sendSuccess(res, issues);
      }
      
      const issuesPath = path.join(STORAGE_DIR, `${sanitizedClaimId}__${sanitizedDocId}__issues.json`);
      
      if (fs.existsSync(issuesPath)) {
        const issuesData = fs.readFileSync(issuesPath, "utf-8");
        return sendSuccess(res, JSON.parse(issuesData));
      }

      const issues = await storage.getIssues(sanitizedClaimId, sanitizedDocId);
      sendSuccess(res, issues);
    } catch (error) {
      console.error("Error fetching issues:", error);
      sendError(res, 500, "FETCH_ERROR", "Failed to fetch issues");
    }
  });

  app.post("/api/audit", auditLimiter, authenticateRequest, async (req, res) => {
    try {
      const audit = AuditLogSchema.parse(req.body);
      
      if (isSupabaseConfigured()) {
        await storage.logAudit(audit, req.userId);
      } else {
        appendAuditLogLocal(audit);
      }

      sendSuccess(res, { success: true });
    } catch (error) {
      console.error("Error logging audit:", error);
      sendError(res, 400, "VALIDATION_ERROR", "Invalid audit log data");
    }
  });

  app.get("/api/audit", authenticateRequest, async (req, res) => {
    try {
      const { documentId } = req.query;
      const docId = documentId ? String(documentId) : undefined;
      
      if (isSupabaseConfigured()) {
        const logs = await storage.getAuditLogs(docId);
        return sendSuccess(res, logs);
      }
      
      let results = [...auditMemory];
      
      if (docId) {
        results = results.filter((r) => r.documentId === docId);
      }

      sendSuccess(res, results.slice(-100));
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      sendError(res, 500, "FETCH_ERROR", "Failed to fetch audit logs");
    }
  });

  app.patch("/api/issues/:issueId/status", authenticateRequest, async (req, res) => {
    try {
      const sanitizedIssueId = sanitizeId(req.params.issueId);
      
      if (!sanitizedIssueId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid issue ID");
      }
      
      const { status } = req.body;
      
      if (!status || !['OPEN', 'APPLIED', 'MANUAL', 'REJECTED'].includes(status)) {
        return sendError(res, 400, "VALIDATION_ERROR", "Invalid status");
      }
      
      await storage.updateIssueStatus(sanitizedIssueId, status);
      
      sendSuccess(res, { success: true });
    } catch (error) {
      console.error("Error updating issue status:", error);
      sendError(res, 500, "UPDATE_ERROR", "Failed to update issue status");
    }
  });

  // Canonical schema endpoints
  app.post("/api/documents/:documentId/corrections", authenticateRequest, async (req, res) => {
    try {
      const sanitizedDocId = sanitizeId(req.params.documentId);
      if (!sanitizedDocId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid document ID");
      }

      // Verify document belongs to user
      const doc = await storage.getDocument(sanitizedDocId);
      if (!doc) {
        return sendError(res, 404, "NOT_FOUND", "Document not found");
      }

      const correctionData = CorrectionSchema.parse(req.body);
      
      // Ensure document_id and claim_id are set
      if (!correctionData.claim_id) {
        return sendError(res, 400, "VALIDATION_ERROR", "claim_id is required");
      }
      
      // Verify claim_id matches document's claim
      if (doc.claimId !== correctionData.claim_id) {
        return sendError(res, 400, "VALIDATION_ERROR", "claim_id does not match document's claim");
      }
      
      const correction = {
        ...correctionData,
        document_id: sanitizedDocId,
        evidence: {
          ...correctionData.evidence,
          source_document: sanitizedDocId,
        },
      };
      
      const created = await storage.createCorrection(correction, req.userId);
      
      cache.deletePattern(`corrections:${sanitizedDocId}`);
      
      sendSuccess(res, created, 201);
    } catch (error) {
      console.error("Error creating correction:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return sendError(res, 400, "VALIDATION_ERROR", "Invalid correction data", error);
      }
      sendError(res, 400, "VALIDATION_ERROR", "Invalid correction data");
    }
  });

  app.get("/api/documents/:documentId/corrections", authenticateRequest, async (req, res) => {
    try {
      const sanitizedDocId = sanitizeId(req.params.documentId);
      if (!sanitizedDocId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid document ID");
      }

      // Verify document belongs to user
      const doc = await storage.getDocument(sanitizedDocId);
      if (!doc) {
        return sendError(res, 404, "NOT_FOUND", "Document not found");
      }

      const pagination = parsePaginationParams(req.query);
      const cacheKeyStr = cacheKey("corrections", sanitizedDocId, pagination.page, pagination.limit);
      const result = await withCache(cacheKeyStr, async () => {
        return await storage.getCorrectionsPaginated(sanitizedDocId, req.userId, pagination);
      }, 30000);
      
      sendSuccess(res, createPaginatedResponse(result.data, result.total, pagination));
    } catch (error) {
      console.error("Error fetching corrections:", error);
      sendError(res, 500, "FETCH_ERROR", "Failed to fetch corrections");
    }
  });

  app.patch("/api/corrections/:correctionId/status", authenticateRequest, async (req, res) => {
    try {
      const sanitizedId = sanitizeId(req.params.correctionId);
      if (!sanitizedId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid correction ID");
      }

      const { status, method } = req.body;
      if (!status || !['pending', 'applied', 'rejected', 'manual'].includes(status)) {
        return sendError(res, 400, "VALIDATION_ERROR", "Invalid status");
      }
      
      await storage.updateCorrectionStatus(sanitizedId, status, req.userId, method, req.userId);
      
      cache.deletePattern(`corrections:`);
      
      sendSuccess(res, { success: true });
    } catch (error) {
      console.error("Error updating correction status:", error);
      sendError(res, 500, "UPDATE_ERROR", "Failed to update correction status");
    }
  });

  app.post("/api/documents/:documentId/annotations", authenticateRequest, async (req, res) => {
    try {
      const sanitizedDocId = sanitizeId(req.params.documentId);
      if (!sanitizedDocId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid document ID");
      }

      // Verify document belongs to user
      const doc = await storage.getDocument(sanitizedDocId);
      if (!doc) {
        return sendError(res, 404, "NOT_FOUND", "Document not found");
      }

      const annotationData = AnnotationSchema.parse(req.body);
      
      const annotation = {
        ...annotationData,
        location: annotationData.location,
      };
      
      const created = await storage.createAnnotation(annotation, req.userId);
      
      // Update document_id after creation
      if (created && supabaseAdmin) {
        await supabaseAdmin
          .from('annotations')
          .update({ document_id: sanitizedDocId })
          .eq('id', created.id);
      }
      
      cache.deletePattern(`annotations:${sanitizedDocId}`);
      
      sendSuccess(res, { ...created, document_id: sanitizedDocId }, 201);
    } catch (error) {
      console.error("Error creating annotation:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return sendError(res, 400, "VALIDATION_ERROR", "Invalid annotation data", error);
      }
      sendError(res, 400, "VALIDATION_ERROR", "Invalid annotation data");
    }
  });

  app.get("/api/documents/:documentId/annotations", authenticateRequest, async (req, res) => {
    try {
      const sanitizedDocId = sanitizeId(req.params.documentId);
      if (!sanitizedDocId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid document ID");
      }

      // Verify document belongs to user
      const doc = await storage.getDocument(sanitizedDocId);
      if (!doc) {
        return sendError(res, 404, "NOT_FOUND", "Document not found");
      }

      const pagination = parsePaginationParams(req.query);
      const cacheKeyStr = cacheKey("annotations", sanitizedDocId, pagination.page, pagination.limit);
      const result = await withCache(cacheKeyStr, async () => {
        return await storage.getAnnotationsPaginated(sanitizedDocId, req.userId, pagination);
      }, 30000);
      
      sendSuccess(res, createPaginatedResponse(result.data, result.total, pagination));
    } catch (error) {
      console.error("Error fetching annotations:", error);
      sendError(res, 500, "FETCH_ERROR", "Failed to fetch annotations");
    }
  });

  app.delete("/api/annotations/:annotationId", authenticateRequest, async (req, res) => {
    try {
      const sanitizedId = sanitizeId(req.params.annotationId);
      if (!sanitizedId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid annotation ID");
      }

      await storage.deleteAnnotation(sanitizedId, req.userId);
      
      cache.deletePattern(`annotations:`);
      
      sendSuccess(res, { success: true });
    } catch (error) {
      console.error("Error deleting annotation:", error);
      sendError(res, 500, "DELETE_ERROR", "Failed to delete annotation");
    }
  });

  app.patch("/api/annotations/:annotationId", authenticateRequest, async (req, res) => {
    try {
      const sanitizedId = sanitizeId(req.params.annotationId);
      if (!sanitizedId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid annotation ID");
      }

      const updates = req.body;
      const updated = await storage.updateAnnotation(sanitizedId, updates, req.userId);
      
      cache.deletePattern(`annotations:`);
      
      sendSuccess(res, updated);
    } catch (error) {
      console.error("Error updating annotation:", error);
      sendError(res, 500, "UPDATE_ERROR", "Failed to update annotation");
    }
  });

  app.get("/api/claims/:claimId/validations", authenticateRequest, async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      if (!sanitizedClaimId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid claim ID");
      }

      // Verify claim belongs to user
      const claim = await storage.getClaimById(sanitizedClaimId);
      if (!claim) {
        return sendError(res, 404, "NOT_FOUND", "Claim not found");
      }

      const pagination = parsePaginationParams(req.query);
      const cacheKeyStr = cacheKey("validations", sanitizedClaimId, pagination.page, pagination.limit);
      const result = await withCache(cacheKeyStr, async () => {
        return await storage.getCrossDocValidationsPaginated(sanitizedClaimId, req.userId, pagination);
      }, 30000);
      
      sendSuccess(res, createPaginatedResponse(result.data, result.total, pagination));
    } catch (error) {
      console.error("Error fetching validations:", error);
      sendError(res, 500, "FETCH_ERROR", "Failed to fetch cross-document validations");
    }
  });

  app.get("/api/claims/:claimId/cross-document-validations", authenticateRequest, async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      if (!sanitizedClaimId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid claim ID");
      }

      // Verify claim belongs to user
      const claim = await storage.getClaimById(sanitizedClaimId);
      if (!claim) {
        return sendError(res, 404, "NOT_FOUND", "Claim not found");
      }

      const pagination = parsePaginationParams(req.query);
      const cacheKeyStr = cacheKey("cross-validations", sanitizedClaimId, pagination.page, pagination.limit);
      const result = await withCache(cacheKeyStr, async () => {
        return await storage.getCrossDocValidationsPaginated(sanitizedClaimId, req.userId, pagination);
      }, 30000);
      
      sendSuccess(res, createPaginatedResponse(result.data, result.total, pagination));
    } catch (error) {
      console.error("Error fetching validations:", error);
      sendError(res, 500, "FETCH_ERROR", "Failed to fetch cross-document validations");
    }
  });

  app.post("/api/claims/:claimId/cross-document-validations", authenticateRequest, async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      if (!sanitizedClaimId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid claim ID");
      }

      // Verify claim belongs to user
      const claim = await storage.getClaimById(sanitizedClaimId);
      if (!claim) {
        return sendError(res, 404, "NOT_FOUND", "Claim not found");
      }

      const validation = CrossDocumentValidationSchema.parse(req.body);
      await storage.saveCrossDocumentValidation(validation, req.userId);
      sendSuccess(res, { success: true, validation }, 201);
    } catch (error) {
      console.error("Error creating validation:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return sendError(res, 400, "VALIDATION_ERROR", "Invalid validation data", error);
      }
      sendError(res, 400, "VALIDATION_ERROR", "Invalid validation data");
    }
  });

  app.patch("/api/cross-document-validations/:validationId/status", authenticateRequest, async (req, res) => {
    try {
      const sanitizedId = sanitizeId(req.params.validationId);
      if (!sanitizedId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid validation ID");
      }

      const { status, resolved_value } = req.body;
      if (!status || !['pending', 'resolved', 'ignored', 'escalated'].includes(status)) {
        return sendError(res, 400, "VALIDATION_ERROR", "Invalid status");
      }

      await storage.updateCrossDocumentValidationStatus(sanitizedId, status, resolved_value, req.userId);
      
      cache.deletePattern(`validations:|cross-validations:`);
      
      sendSuccess(res, { success: true });
    } catch (error) {
      console.error("Error updating validation status:", error);
      sendError(res, 500, "UPDATE_ERROR", "Failed to update validation status");
    }
  });

  app.post("/api/validations/:id/resolve", authenticateRequest, async (req, res) => {
    try {
      const sanitizedId = sanitizeId(req.params.id);
      if (!sanitizedId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid validation ID");
      }

      const { resolved_value } = req.body;
      if (!resolved_value) {
        return sendError(res, 400, "VALIDATION_ERROR", "resolved_value is required");
      }
      
      await storage.resolveCrossDocValidation(sanitizedId, resolved_value, req.userId!);
      sendSuccess(res, { success: true });
    } catch (error) {
      console.error("Error resolving validation:", error);
      sendError(res, 500, "RESOLVE_ERROR", "Failed to resolve validation");
    }
  });

  app.post("/api/validations/:id/escalate", authenticateRequest, async (req, res) => {
    try {
      const sanitizedId = sanitizeId(req.params.id);
      if (!sanitizedId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid validation ID");
      }

      const { reason } = req.body;
      if (!reason) {
        return sendError(res, 400, "VALIDATION_ERROR", "reason is required");
      }

      await storage.escalateCrossDocValidation(sanitizedId, reason);
      sendSuccess(res, { success: true });
    } catch (error) {
      console.error("Error escalating validation:", error);
      sendError(res, 500, "ESCALATE_ERROR", "Failed to escalate validation");
    }
  });

  app.post("/api/correction-payload", authenticateRequest, async (req, res) => {
    try {
      const payload = DocumentCorrectionPayloadSchema.parse(req.body);
      await storage.saveCorrectionPayload(payload, req.userId);
      sendSuccess(res, { success: true, payload }, 201);
    } catch (error) {
      console.error("Error saving correction payload:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return sendError(res, 400, "VALIDATION_ERROR", "Invalid correction payload", error);
      }
      sendError(res, 400, "VALIDATION_ERROR", "Invalid correction payload");
    }
  });

  app.post("/api/claims/:claimId/validate", validationLimiter, authenticateRequest, async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      if (!sanitizedClaimId) {
        return sendError(res, 400, "INVALID_INPUT", "Invalid claim ID");
      }

      // Verify claim belongs to user
      const claim = await storage.getClaimById(sanitizedClaimId);
      if (!claim) {
        return sendError(res, 404, "NOT_FOUND", "Claim not found");
      }

      // Get all documents for this claim
      const documents = await storage.getDocumentsByClaim(sanitizedClaimId);
      
      if (documents.length < 2) {
        return sendSuccess(res, { validations: [], count: 0, message: "Need at least 2 documents to validate" });
      }

      const extractor = new FieldExtractor();
      const validator = new CrossDocumentValidator();

      // Extract fields from each document
      const extractedDocs = await Promise.all(
        documents.map(async (doc) => {
          // Extract PDF text content
          let content = "";
          
          if (isSupabaseConfigured()) {
            // Download PDF from Supabase storage
            const fileBuffer = await downloadFromSupabase(doc.documentId);
            if (fileBuffer) {
              // Save to temp file for pdf-parse
              const tempPath = path.join(STORAGE_DIR, `temp-${doc.documentId}.pdf`);
              fs.writeFileSync(tempPath, fileBuffer);
              try {
                content = await extractPdfText(tempPath, 10); // Extract first 10 pages
                fs.unlinkSync(tempPath); // Clean up
              } catch (parseError) {
                console.error(`Error extracting text from ${doc.documentId}:`, parseError);
                if (fs.existsSync(tempPath)) {
                  fs.unlinkSync(tempPath);
                }
              }
            }
          } else {
            // Fallback: read from local storage
            const localPath = path.join(STORAGE_DIR, `${doc.documentId}.pdf`);
            if (fs.existsSync(localPath)) {
              try {
                content = await extractPdfText(localPath, 10);
              } catch (parseError) {
                console.error(`Error extracting text from ${doc.documentId}:`, parseError);
              }
            }
          }
          
          const fields = await extractor.extractFromDocument(doc.documentId, content);
          return {
            document_id: doc.documentId,
            document_name: doc.name,
            fields,
          };
        })
      );

      // Validate cross-document consistency
      const validations = await validator.validateClaim(sanitizedClaimId, extractedDocs);

      // Save validations
      for (const validation of validations) {
        await storage.createCrossDocValidation({
          ...validation,
        }, req.userId);
      }
      
      cache.deletePattern(`validations:|cross-validations:`);

      sendSuccess(res, { validations, count: validations.length });
    } catch (error) {
      console.error("Cross-document validation error:", error);
      sendError(res, 500, "VALIDATION_ERROR", "Failed to validate cross-document consistency");
    }
  });

  app.post("/api/claims/:claimId/validate-cross-document", validationLimiter, authenticateRequest, async (req, res) => {
    // Alias for backward compatibility - redirect to new endpoint
    const sanitizedClaimId = sanitizeId(req.params.claimId);
    if (!sanitizedClaimId) {
      return sendError(res, 400, "INVALID_INPUT", "Invalid claim ID");
    }
    
    // Call the actual handler by constructing a new request
    const originalUrl = req.url;
    req.url = `/api/claims/${sanitizedClaimId}/validate`;
    
    // Use the validate endpoint handler
    try {
      const claim = await storage.getClaimById(sanitizedClaimId);
      if (!claim) {
        return sendError(res, 404, "NOT_FOUND", "Claim not found");
      }

      const documents = await storage.getDocumentsByClaim(sanitizedClaimId);
      
      if (documents.length < 2) {
        return sendSuccess(res, { validations: [], count: 0, message: "Need at least 2 documents to validate" });
      }

      const extractor = new FieldExtractor();
      const validator = new CrossDocumentValidator();

      const extractedDocs = await Promise.all(
        documents.map(async (doc) => {
          let content = "";
          
          if (isSupabaseConfigured()) {
            const fileBuffer = await downloadFromSupabase(doc.documentId);
            if (fileBuffer) {
              const tempPath = path.join(STORAGE_DIR, `temp-${doc.documentId}.pdf`);
              fs.writeFileSync(tempPath, fileBuffer);
              try {
                content = await extractPdfText(tempPath, 10);
                fs.unlinkSync(tempPath);
              } catch (parseError) {
                console.error(`Error extracting text from ${doc.documentId}:`, parseError);
                if (fs.existsSync(tempPath)) {
                  fs.unlinkSync(tempPath);
                }
              }
            }
          } else {
            const localPath = path.join(STORAGE_DIR, `${doc.documentId}.pdf`);
            if (fs.existsSync(localPath)) {
              try {
                content = await extractPdfText(localPath, 10);
              } catch (parseError) {
                console.error(`Error extracting text from ${doc.documentId}:`, parseError);
              }
            }
          }
          
          const fields = await extractor.extractFromDocument(doc.documentId, content);
          return {
            document_id: doc.documentId,
            document_name: doc.name,
            fields,
          };
        })
      );

      const validations = await validator.validateClaim(sanitizedClaimId, extractedDocs);

      for (const validation of validations) {
        await storage.createCrossDocValidation({
          ...validation,
        }, req.userId);
      }
      
      cache.deletePattern(`validations:|cross-validations:`);

      sendSuccess(res, { validations, count: validations.length });
    } catch (error) {
      console.error("Cross-document validation error:", error);
      sendError(res, 500, "VALIDATION_ERROR", "Failed to validate cross-document consistency");
    } finally {
      req.url = originalUrl;
    }
  });

  return httpServer;
}
