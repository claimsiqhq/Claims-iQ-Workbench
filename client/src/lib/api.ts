import type { Claim, Document, IssueBundle, AuditLog, SessionData } from "@shared/schema";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export const api = {
  async getClaims(): Promise<Claim[]> {
    const res = await fetch(`${API_BASE}/api/claims`);
    if (!res.ok) throw new Error("Failed to fetch claims");
    return res.json();
  },

  async getDocuments(claimId: string): Promise<Document[]> {
    const res = await fetch(`${API_BASE}/api/claims/${claimId}/documents`);
    if (!res.ok) throw new Error("Failed to fetch documents");
    return res.json();
  },

  async getSession(documentId: string): Promise<SessionData> {
    const res = await fetch(`${API_BASE}/api/session/${documentId}`);
    if (!res.ok) throw new Error("Failed to fetch session");
    return res.json();
  },

  async getIssues(claimId: string, documentId: string): Promise<IssueBundle> {
    const res = await fetch(`${API_BASE}/api/claims/${claimId}/documents/${documentId}/issues`);
    if (!res.ok) throw new Error("Failed to fetch issues");
    return res.json();
  },

  async logAudit(audit: AuditLog): Promise<void> {
    const res = await fetch(`${API_BASE}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(audit),
    });
    if (!res.ok) throw new Error("Failed to log audit");
  },
};
