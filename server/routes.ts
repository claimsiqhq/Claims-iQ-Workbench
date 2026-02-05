import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase";
import { AuditLogSchema, SessionDataSchema, IssueBundleSchema } from "@shared/schema";
import { DocumentCorrectionPayloadSchema, CorrectionSchema, AnnotationSchema, CrossDocumentValidationSchema } from "@shared/schemas";
import { FieldExtractor } from "./services/field-extractor";
import { CrossDocumentValidator } from "./services/cross-document-validator";
import jwt from "jsonwebtoken";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import path from "path";
import fs from "fs";
import { parsePdfFile, type ExtractedClaimInfo } from "./pdf-parser";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORAGE_DIR = path.resolve(process.cwd(), "storage");
const INDEX_FILE = path.join(DATA_DIR, "index.json");
const AUDIT_LOG_FILE = path.join(DATA_DIR, "audit.log");

const auditMemory: any[] = [];
const MAX_AUDIT_MEMORY = 200;

const upload = multer({
  dest: STORAGE_DIR,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  ensureDataFiles();

  app.use(cors({
    origin: true,
    credentials: true,
  }));

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
    
    res.json({ 
      ok: true,
      supabase: isSupabaseConfigured(),
      schemaValid,
    });
  });

  app.get("/api/claims", async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        const claims = await storage.getClaims();
        return res.json(claims);
      }
      
      const index = readIndex();
      res.json(index.claims);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch claims" });
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

  app.post("/api/documents/upload", upload.fields([
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
            await storage.saveIssues(claimId, documentId, validated.data);
          } else {
            const issuesPath = path.join(STORAGE_DIR, `${claimId}__${documentId}__issues.json`);
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

      res.json({ 
        claimId, 
        documentId,
        extractedInfo 
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.post("/api/claims/:claimId/documents", upload.fields([
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
            await storage.saveIssues(sanitizedClaimId, documentId, validated.data);
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
        const storagePath = await uploadToSupabaseStorage(pdfPath, documentId);
        
        const claimExists = await storage.claimExists(sanitizedClaimId);
        if (!claimExists) {
          await storage.createClaim({ claimId: sanitizedClaimId });
        }
        
        await storage.createDocument({
          documentId,
          claimId: sanitizedClaimId,
          title: pdfFile.originalname || `${documentId}.pdf`,
          filePath: storagePath || `public/${documentId}.pdf`,
          fileSize: pdfFile.size,
        });
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

      res.json({ claimId: sanitizedClaimId, documentId });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload document" });
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

  app.get("/api/session/:documentId", async (req, res) => {
    try {
      const sanitizedDocId = sanitizeId(req.params.documentId);
      
      if (!sanitizedDocId) {
        return res.status(400).json({ error: "Invalid document ID" });
      }
      
      const exists = await documentExistsCheck(sanitizedDocId);
      if (!exists) {
        return res.status(404).json({ error: "Document not found" });
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

          return res.json(sessionData);
        } catch (jwtError) {
          console.error("JWT generation failed:", jwtError);
          return res.status(500).json({ 
            error: "JWT configuration error. Check JWT_PRIVATE_KEY_PEM format." 
          });
        }
      }

      const fallbackSession = SessionDataSchema.parse({
        documentId: sanitizedDocId,
        autoSaveMode: "DISABLED" as const,
      });
      
      res.json(fallbackSession);
    } catch (error) {
      console.error("Session error:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.get("/api/claims/:claimId/documents/:documentId/issues", async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      const sanitizedDocId = sanitizeId(req.params.documentId);
      
      if (!sanitizedClaimId || !sanitizedDocId) {
        return res.status(400).json({ error: "Invalid claim or document ID" });
      }
      
      const exists = await documentExistsCheck(sanitizedDocId, sanitizedClaimId);
      if (!exists) {
        return res.status(404).json({ error: "Document not found for this claim" });
      }
      
      if (isSupabaseConfigured()) {
        const issues = await storage.getIssues(sanitizedClaimId, sanitizedDocId);
        return res.json(issues);
      }
      
      const issuesPath = path.join(STORAGE_DIR, `${sanitizedClaimId}__${sanitizedDocId}__issues.json`);
      
      if (fs.existsSync(issuesPath)) {
        const issuesData = fs.readFileSync(issuesPath, "utf-8");
        return res.json(JSON.parse(issuesData));
      }

      const issues = await storage.getIssues(sanitizedClaimId, sanitizedDocId);
      res.json(issues);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch issues" });
    }
  });

  app.post("/api/audit", async (req, res) => {
    try {
      const audit = AuditLogSchema.parse(req.body);
      
      if (isSupabaseConfigured()) {
        await storage.logAudit(audit);
      } else {
        appendAuditLogLocal(audit);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Invalid audit log data" });
    }
  });

  app.get("/api/audit", async (req, res) => {
    try {
      const { documentId } = req.query;
      const docId = documentId ? String(documentId) : undefined;
      
      if (isSupabaseConfigured()) {
        const logs = await storage.getAuditLogs(docId);
        return res.json(logs);
      }
      
      let results = [...auditMemory];
      
      if (docId) {
        results = results.filter((r) => r.documentId === docId);
      }

      res.json(results.slice(-100));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.patch("/api/issues/:issueId/status", async (req, res) => {
    try {
      const sanitizedIssueId = sanitizeId(req.params.issueId);
      
      if (!sanitizedIssueId) {
        return res.status(400).json({ error: "Invalid issue ID" });
      }
      
      const { status } = req.body;
      
      if (!status || !['OPEN', 'APPLIED', 'MANUAL', 'REJECTED'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      
      await storage.updateIssueStatus(sanitizedIssueId, status);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update issue status" });
    }
  });

  // Canonical schema endpoints
  app.post("/api/documents/:documentId/corrections", async (req, res) => {
    try {
      const sanitizedDocId = sanitizeId(req.params.documentId);
      if (!sanitizedDocId) {
        return res.status(400).json({ error: "Invalid document ID" });
      }

      const userId = req.headers['x-user-id'] as string;
      const correctionData = CorrectionSchema.parse(req.body);
      
      // Ensure document_id is set in evidence
      const correction = {
        ...correctionData,
        evidence: {
          ...correctionData.evidence,
          source_document: sanitizedDocId,
        },
      };
      
      const created = await storage.createCorrection(correction, userId);
      res.status(201).json(created);
    } catch (error) {
      res.status(400).json({ error: "Invalid correction data" });
    }
  });

  app.get("/api/documents/:documentId/corrections", async (req, res) => {
    try {
      const sanitizedDocId = sanitizeId(req.params.documentId);
      if (!sanitizedDocId) {
        return res.status(400).json({ error: "Invalid document ID" });
      }

      const corrections = await storage.getCorrections(sanitizedDocId);
      res.json(corrections);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch corrections" });
    }
  });

  app.patch("/api/corrections/:correctionId/status", async (req, res) => {
    try {
      const sanitizedId = sanitizeId(req.params.correctionId);
      if (!sanitizedId) {
        return res.status(400).json({ error: "Invalid correction ID" });
      }

      const { status, method } = req.body;
      if (!status || !['pending', 'applied', 'rejected', 'manual'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // Get userId from auth if available
      const userId = req.headers['x-user-id'] as string;
      
      await storage.updateCorrectionStatus(sanitizedId, status, userId, method, userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update correction status" });
    }
  });

  app.post("/api/documents/:documentId/annotations", async (req, res) => {
    try {
      const sanitizedDocId = sanitizeId(req.params.documentId);
      if (!sanitizedDocId) {
        return res.status(400).json({ error: "Invalid document ID" });
      }

      const userId = req.headers['x-user-id'] as string;
      const annotationData = AnnotationSchema.parse(req.body);
      
      // Set document_id in annotation location if needed
      const annotation = {
        ...annotationData,
        location: annotationData.location,
      };
      
      const created = await storage.createAnnotation(annotation, userId);
      
      // Update document_id after creation
      if (created && supabaseAdmin) {
        await supabaseAdmin
          .from('annotations')
          .update({ document_id: sanitizedDocId })
          .eq('id', created.id);
      }
      
      res.status(201).json(created);
    } catch (error) {
      res.status(400).json({ error: "Invalid annotation data" });
    }
  });

  app.get("/api/documents/:documentId/annotations", async (req, res) => {
    try {
      const sanitizedDocId = sanitizeId(req.params.documentId);
      if (!sanitizedDocId) {
        return res.status(400).json({ error: "Invalid document ID" });
      }

      const annotations = await storage.getAnnotations(sanitizedDocId);
      res.json(annotations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch annotations" });
    }
  });

  app.delete("/api/annotations/:annotationId", async (req, res) => {
    try {
      const sanitizedId = sanitizeId(req.params.annotationId);
      if (!sanitizedId) {
        return res.status(400).json({ error: "Invalid annotation ID" });
      }

      await storage.deleteAnnotation(sanitizedId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete annotation" });
    }
  });

  app.get("/api/claims/:claimId/validations", async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      if (!sanitizedClaimId) {
        return res.status(400).json({ error: "Invalid claim ID" });
      }

      const validations = await storage.getCrossDocumentValidations(sanitizedClaimId);
      res.json(validations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cross-document validations" });
    }
  });

  app.get("/api/claims/:claimId/cross-document-validations", async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      if (!sanitizedClaimId) {
        return res.status(400).json({ error: "Invalid claim ID" });
      }

      const validations = await storage.getCrossDocumentValidations(sanitizedClaimId);
      res.json(validations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cross-document validations" });
    }
  });

  app.post("/api/claims/:claimId/cross-document-validations", async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      if (!sanitizedClaimId) {
        return res.status(400).json({ error: "Invalid claim ID" });
      }

      const validation = CrossDocumentValidationSchema.parse(req.body);
      await storage.saveCrossDocumentValidation(validation);
      res.json({ success: true, validation });
    } catch (error) {
      res.status(400).json({ error: "Invalid validation data" });
    }
  });

  app.patch("/api/cross-document-validations/:validationId/status", async (req, res) => {
    try {
      const sanitizedId = sanitizeId(req.params.validationId);
      if (!sanitizedId) {
        return res.status(400).json({ error: "Invalid validation ID" });
      }

      const { status, resolved_value } = req.body;
      if (!status || !['pending', 'resolved', 'ignored', 'escalated'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      await storage.updateCrossDocumentValidationStatus(sanitizedId, status, resolved_value);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update validation status" });
    }
  });

  app.post("/api/validations/:id/resolve", async (req, res) => {
    try {
      const sanitizedId = sanitizeId(req.params.id);
      if (!sanitizedId) {
        return res.status(400).json({ error: "Invalid validation ID" });
      }

      const { resolved_value } = req.body;
      if (!resolved_value) {
        return res.status(400).json({ error: "resolved_value is required" });
      }

      // Get userId from auth if available
      const userId = req.headers['x-user-id'] as string || 'system';
      
      await storage.resolveCrossDocValidation(sanitizedId, resolved_value, userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to resolve validation" });
    }
  });

  app.post("/api/validations/:id/escalate", async (req, res) => {
    try {
      const sanitizedId = sanitizeId(req.params.id);
      if (!sanitizedId) {
        return res.status(400).json({ error: "Invalid validation ID" });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: "reason is required" });
      }

      await storage.escalateCrossDocValidation(sanitizedId, reason);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to escalate validation" });
    }
  });

  app.post("/api/correction-payload", async (req, res) => {
    try {
      const payload = DocumentCorrectionPayloadSchema.parse(req.body);
      await storage.saveCorrectionPayload(payload);
      res.json({ success: true, payload });
    } catch (error) {
      res.status(400).json({ error: "Invalid correction payload", details: error instanceof Error ? error.message : "Parse error" });
    }
  });

  app.post("/api/claims/:claimId/validate", async (req, res) => {
    try {
      const sanitizedClaimId = sanitizeId(req.params.claimId);
      if (!sanitizedClaimId) {
        return res.status(400).json({ error: "Invalid claim ID" });
      }

      // Get all documents for this claim
      const documents = await storage.getDocumentsByClaim(sanitizedClaimId);
      
      if (documents.length < 2) {
        return res.json({ validations: [], count: 0, message: "Need at least 2 documents to validate" });
      }

      const extractor = new FieldExtractor();
      const validator = new CrossDocumentValidator();

      // Extract fields from each document
      const extractedDocs = await Promise.all(
        documents.map(async (doc) => {
          // In a real implementation, you'd extract text from the PDF
          // For now, we'll use a placeholder - in production, read PDF content
          const content = ""; // TODO: Extract PDF text content using pdf-parser or similar
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
      const userId = req.headers['x-user-id'] as string;
      for (const validation of validations) {
        await storage.createCrossDocValidation({
          ...validation,
        }, userId);
      }

      res.json({ validations, count: validations.length });
    } catch (error) {
      console.error("Cross-document validation error:", error);
      res.status(500).json({ error: "Failed to validate cross-document consistency" });
    }
  });

  app.post("/api/claims/:claimId/validate-cross-document", async (req, res) => {
    // Alias for backward compatibility
    return app._router.handle({ ...req, url: `/api/claims/${req.params.claimId}/validate`, method: 'POST' }, res);
  });

  return httpServer;
}
