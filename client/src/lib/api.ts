import type { Claim, Document, IssueBundle, AuditLog, SessionData, ExtractedClaimInfo } from "@shared/schema";
import type { Correction, Annotation, CrossDocumentValidation, DocumentCorrectionPayload } from "@shared/schemas";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export interface HealthStatus {
  ok: boolean;
  supabase: boolean;
  schemaValid: boolean;
}

export const api = {
  async getHealth(): Promise<HealthStatus> {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error("Failed to fetch health status");
    return res.json();
  },

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
    issuesFile?: File,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<{ claimId: string; documentId: string; extractedInfo: ExtractedClaimInfo }> {
    const formData = new FormData();
    formData.append("file", file);
    if (issuesFile) {
      formData.append("issues", issuesFile);
    }
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 50);
          onProgress?.(percentComplete, "Uploading file...");
        }
      });
      
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100, "Complete!");
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch {
            reject(new Error("Invalid response from server"));
          }
        } else {
          let errorMessage = "Failed to upload and parse document";
          try {
            const errorJson = JSON.parse(xhr.responseText);
            errorMessage = errorJson.error || errorMessage;
            if (errorJson.details) {
              errorMessage += `: ${errorJson.details}`;
            }
          } catch {
            errorMessage = xhr.responseText || errorMessage;
          }
          reject(new Error(errorMessage));
        }
      });
      
      xhr.addEventListener("error", () => {
        reject(new Error("Network error during upload"));
      });
      
      xhr.addEventListener("loadend", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100, "Complete!");
        }
      });
      
      xhr.open("POST", `${API_BASE}/api/documents/upload`);
      
      onProgress?.(0, "Starting upload...");
      xhr.send(formData);
      
      setTimeout(() => {
        if (xhr.readyState !== 4) {
          onProgress?.(55, "Processing document...");
        }
      }, 500);
      
      setTimeout(() => {
        if (xhr.readyState !== 4) {
          onProgress?.(70, "Extracting information...");
        }
      }, 1500);
      
      setTimeout(() => {
        if (xhr.readyState !== 4) {
          onProgress?.(85, "Finalizing...");
        }
      }, 3000);
    });
  },

  async getAuditLogs(documentId?: string): Promise<AuditLog[]> {
    const url = documentId 
      ? `${API_BASE}/api/audit?documentId=${documentId}`
      : `${API_BASE}/api/audit`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch audit logs");
    return res.json();
  },

  // Canonical schema endpoints
  async getCorrections(documentId: string): Promise<Correction[]> {
    const res = await fetch(`${API_BASE}/api/documents/${documentId}/corrections`);
    if (!res.ok) throw new Error("Failed to fetch corrections");
    return res.json();
  },

  async saveCorrection(documentId: string, correction: Correction): Promise<void> {
    const res = await fetch(`${API_BASE}/api/documents/${documentId}/corrections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(correction),
    });
    if (!res.ok) throw new Error("Failed to save correction");
  },

  async updateCorrectionStatus(correctionId: string, status: Correction["status"]): Promise<void> {
    const res = await fetch(`${API_BASE}/api/corrections/${correctionId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error("Failed to update correction status");
  },

  async getAnnotations(documentId: string): Promise<Annotation[]> {
    const res = await fetch(`${API_BASE}/api/documents/${documentId}/annotations`);
    if (!res.ok) throw new Error("Failed to fetch annotations");
    return res.json();
  },

  async saveAnnotation(documentId: string, annotation: Annotation): Promise<void> {
    const res = await fetch(`${API_BASE}/api/documents/${documentId}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(annotation),
    });
    if (!res.ok) throw new Error("Failed to save annotation");
  },

  async deleteAnnotation(annotationId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete annotation");
  },

  async getCrossDocumentValidations(claimId: string): Promise<CrossDocumentValidation[]> {
    const res = await fetch(`${API_BASE}/api/claims/${claimId}/validations`);
    if (!res.ok) throw new Error("Failed to fetch cross-document validations");
    return res.json();
  },

  async validateCrossDocument(claimId: string): Promise<{ validations: CrossDocumentValidation[]; count: number }> {
    // Try new endpoint first, fallback to old one
    let res = await fetch(`${API_BASE}/api/claims/${claimId}/validate`, {
      method: "POST",
    });
    if (!res.ok) {
      // Fallback to old endpoint
      res = await fetch(`${API_BASE}/api/claims/${claimId}/validate-cross-document`, {
        method: "POST",
      });
    }
    if (!res.ok) throw new Error("Failed to validate cross-document consistency");
    return res.json();
  },

  async updateCrossDocumentValidationStatus(
    validationId: string,
    status: CrossDocumentValidation["status"],
    resolvedValue?: string
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/api/cross-document-validations/${validationId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolved_value: resolvedValue }),
    });
    if (!res.ok) throw new Error("Failed to update validation status");
  },

  async resolveCrossDocValidation(validationId: string, resolvedValue: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/validations/${validationId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved_value: resolvedValue }),
    });
    if (!res.ok) throw new Error("Failed to resolve validation");
  },

  async escalateCrossDocValidation(validationId: string, reason: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/validations/${validationId}/escalate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error("Failed to escalate validation");
  },

  async saveCorrectionPayload(payload: DocumentCorrectionPayload): Promise<void> {
    const res = await fetch(`${API_BASE}/api/correction-payload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to save correction payload");
  },
};
