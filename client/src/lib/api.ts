import type { Claim, Document, IssueBundle, AuditLog, SessionData, ExtractedClaimInfo } from "@shared/schema";

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

  async uploadDocument(
    claimId: string, 
    file: File, 
    issues?: object
  ): Promise<{ claimId: string; documentId: string }> {
    const formData = new FormData();
    formData.append("file", file);
    if (issues) {
      formData.append("issues", JSON.stringify(issues));
    }
    
    const res = await fetch(`${API_BASE}/api/claims/${claimId}/documents`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to upload document");
    return res.json();
  },

  async uploadAndParseDocument(
    file: File,
    issuesFile?: File
  ): Promise<{ claimId: string; documentId: string; extractedInfo: ExtractedClaimInfo }> {
    const formData = new FormData();
    formData.append("file", file);
    if (issuesFile) {
      formData.append("issues", issuesFile);
    }
    
    const res = await fetch(`${API_BASE}/api/documents/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const errorText = await res.text();
      let errorMessage = "Failed to upload and parse document";
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.details) {
          errorMessage += `: ${errorJson.details}`;
        }
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    return res.json();
  },

  async getAuditLogs(documentId?: string): Promise<AuditLog[]> {
    const url = documentId 
      ? `${API_BASE}/api/audit?documentId=${documentId}`
      : `${API_BASE}/api/audit`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch audit logs");
    return res.json();
  },
};
