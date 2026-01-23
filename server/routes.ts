import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { AuditLogSchema, SessionDataSchema } from "@shared/schema";
import jwt from "jsonwebtoken";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import path from "path";
import fs from "fs";

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

function appendAuditLog(record: any) {
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

async function registerWithDocEngine(documentId: string): Promise<boolean> {
  const docEngineUrl = process.env.DOC_ENGINE_URL;
  const apiToken = process.env.DOC_ENGINE_API_TOKEN;
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;

  if (!docEngineUrl || !apiToken || !publicBaseUrl) {
    console.log("Document Engine not configured, skipping registration");
    return false;
  }

  const pdfUrl = `${publicBaseUrl}/files/${documentId}.pdf`;

  try {
    const response = await fetch(`${docEngineUrl}api/documents`, {
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  ensureDataFiles();

  app.use(cors({
    origin: true,
    credentials: true,
  }));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/claims", async (req, res) => {
    try {
      const index = readIndex();
      res.json(index.claims);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch claims" });
    }
  });

  app.get("/api/claims/:claimId/documents", async (req, res) => {
    try {
      const { claimId } = req.params;
      const index = readIndex();
      const claim = index.claims.find((c) => c.claimId === claimId);
      
      if (!claim) {
        return res.json([]);
      }

      const documents = claim.documents.map((doc: any) => ({
        documentId: doc.documentId,
        name: doc.title,
        claimId,
      }));

      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.post("/api/claims/:claimId/documents", upload.fields([
    { name: "file", maxCount: 1 },
    { name: "issues", maxCount: 1 },
  ]), async (req, res) => {
    try {
      const { claimId } = req.params;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!files.file || files.file.length === 0) {
        return res.status(400).json({ error: "PDF file is required" });
      }

      const pdfFile = files.file[0];
      const documentId = uuidv4();
      const pdfPath = path.join(STORAGE_DIR, `${documentId}.pdf`);
      
      fs.renameSync(pdfFile.path, pdfPath);

      let issuesData: any = null;
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
        const issuesPath = path.join(STORAGE_DIR, `${claimId}__${documentId}__issues.json`);
        fs.writeFileSync(issuesPath, JSON.stringify(issuesData, null, 2));
      }

      const index = readIndex();
      let claim = index.claims.find((c) => c.claimId === claimId);
      
      if (!claim) {
        claim = { claimId, documents: [] };
        index.claims.push(claim);
      }

      claim.documents.push({
        documentId,
        title: pdfFile.originalname || `${documentId}.pdf`,
      });

      writeIndex(index);

      await registerWithDocEngine(documentId);

      res.json({ claimId, documentId });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.get("/files/:filename", (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(STORAGE_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    res.sendFile(filePath);
  });

  app.get("/api/session/:documentId", async (req, res) => {
    try {
      const { documentId } = req.params;
      const docEngineUrl = process.env.DOC_ENGINE_URL;

      if (process.env.JWT_PRIVATE_KEY_PEM) {
        try {
          const { jwt: token, exp } = generateJWT(documentId);

          const sessionData = {
            documentId,
            jwt: token,
            serverUrl: docEngineUrl || undefined,
            instant: docEngineUrl ? "true" : undefined,
            autoSaveMode: "INTELLIGENT" as const,
            exp,
          };

          return res.json(sessionData);
        } catch (jwtError) {
          console.error("JWT generation failed:", jwtError);
        }
      }

      res.json({
        documentId,
        autoSaveMode: "DISABLED" as const,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.get("/api/claims/:claimId/documents/:documentId/issues", async (req, res) => {
    try {
      const { claimId, documentId } = req.params;
      
      const issuesPath = path.join(STORAGE_DIR, `${claimId}__${documentId}__issues.json`);
      
      if (fs.existsSync(issuesPath)) {
        const issuesData = fs.readFileSync(issuesPath, "utf-8");
        return res.json(JSON.parse(issuesData));
      }

      const issues = await storage.getIssues(claimId, documentId);
      res.json(issues);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch issues" });
    }
  });

  app.post("/api/audit", async (req, res) => {
    try {
      const audit = AuditLogSchema.parse(req.body);
      
      appendAuditLog(audit);
      await storage.logAudit(audit);

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Invalid audit log data" });
    }
  });

  app.get("/api/audit", (req, res) => {
    try {
      const { documentId } = req.query;
      
      let results = [...auditMemory];
      
      if (documentId) {
        results = results.filter((r) => r.documentId === documentId);
      }

      res.json(results.slice(-100));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  return httpServer;
}
