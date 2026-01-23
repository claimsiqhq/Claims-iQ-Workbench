import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { AuditLogSchema, SessionDataSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // GET /api/claims - List all claims
  app.get("/api/claims", async (req, res) => {
    try {
      const claims = await storage.getClaims();
      res.json(claims);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch claims" });
    }
  });

  // GET /api/claims/:claimId/documents - Get documents for a claim
  app.get("/api/claims/:claimId/documents", async (req, res) => {
    try {
      const { claimId } = req.params;
      const documents = await storage.getDocumentsByClaim(claimId);
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  // GET /api/session/:documentId - Get session data for Nutrient
  app.get("/api/session/:documentId", async (req, res) => {
    try {
      const { documentId } = req.params;
      
      // Return demo session data
      // In production, this would integrate with Nutrient Document Engine
      const sessionData = {
        documentId,
        autoSaveMode: "DISABLED" as const,
      };
      
      const validated = SessionDataSchema.parse(sessionData);
      res.json(validated);
    } catch (error) {
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // GET /api/claims/:claimId/documents/:documentId/issues - Get issue bundle
  app.get("/api/claims/:claimId/documents/:documentId/issues", async (req, res) => {
    try {
      const { claimId, documentId } = req.params;
      const issues = await storage.getIssues(claimId, documentId);
      res.json(issues);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch issues" });
    }
  });

  // POST /api/audit - Log audit event
  app.post("/api/audit", async (req, res) => {
    try {
      const audit = AuditLogSchema.parse(req.body);
      await storage.logAudit(audit);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Invalid audit log data" });
    }
  });

  return httpServer;
}
