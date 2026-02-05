import type { Claim, Document, IssueBundle, AuditLog, SessionData, ExtractedClaimInfo } from "@shared/schema";
import type { Correction, Annotation, CrossDocumentValidation, DocumentCorrectionPayload } from "@shared/schemas";
import { supabase } from "./supabase";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Custom API Error class with status code and details
 */
export class APIError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = "APIError";
  }
}

/**
 * Get access token from Supabase session
 */
async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch (error) {
    console.error("Error getting access token:", error);
    return null;
  }
}

/**
 * Authenticated fetch wrapper
 */
async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  headers.set("Content-Type", "application/json");
  
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
  
  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: { message: response.statusText } };
    }
    
    throw new APIError(
      response.status,
      errorData.error?.code || "UNKNOWN_ERROR",
      errorData.error?.message || `Request failed: ${response.statusText}`,
      errorData.error?.details
    );
  }
  
  return response;
}

export interface HealthStatus {
  ok: boolean;
  supabase: boolean;
  schemaValid: boolean;
}

export const api = {
  async getHealth(): Promise<HealthStatus> {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new APIError(res.status, error.error?.code || "UNKNOWN_ERROR", error.error?.message || "Failed to fetch health status");
    }
    const data = await res.json();
    return data.data || data; // Handle both { data: ... } and direct response
  },

  async getClaims(): Promise<Claim[]> {
    const res = await authenticatedFetch(`${API_BASE}/api/claims`);
    const data = await res.json();
    // Handle paginated response: { data: { data: [], pagination: {...} } }
    // Or direct array: { data: [] }
    const responseData = data.data || data;
    
    // If it's already an array, return it
    if (Array.isArray(responseData)) {
      return responseData;
    }
    
    // If it's a paginated response, extract the data array
    if (responseData && typeof responseData === 'object' && 'data' in responseData) {
      return Array.isArray(responseData.data) ? responseData.data : [];
    }
    
    // Fallback to empty array
    return [];
  },

  async getDocuments(claimId: string): Promise<Document[]> {
    const res = await authenticatedFetch(`${API_BASE}/api/claims/${claimId}/documents`);
    const data = await res.json();
    const responseData = data.data || data;
    
    if (Array.isArray(responseData)) {
      return responseData;
    }
    
    if (responseData && typeof responseData === 'object' && 'data' in responseData) {
      return Array.isArray(responseData.data) ? responseData.data : [];
    }
    
    return [];
  },

  async getSession(documentId: string): Promise<SessionData> {
    const res = await authenticatedFetch(`${API_BASE}/api/session/${documentId}`);
    const data = await res.json();
    return data.data || data;
  },

  async getIssues(claimId: string, documentId: string): Promise<IssueBundle> {
    const res = await authenticatedFetch(`${API_BASE}/api/claims/${claimId}/documents/${documentId}/issues`);
    const data = await res.json();
    return data.data || data;
  },

  async logAudit(audit: AuditLog): Promise<void> {
    await authenticatedFetch(`${API_BASE}/api/audit`, {
      method: "POST",
      body: JSON.stringify(audit),
    });
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
    
    const token = await getAccessToken();
    
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
      
      // Add auth header
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      
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
    const res = await authenticatedFetch(url);
    const data = await res.json();
    const responseData = data.data || data;
    
    if (Array.isArray(responseData)) {
      return responseData;
    }
    
    if (responseData && typeof responseData === 'object' && 'data' in responseData) {
      return Array.isArray(responseData.data) ? responseData.data : [];
    }
    
    return [];
  },

  // Canonical schema endpoints
  async getCorrections(documentId: string): Promise<Correction[]> {
    const res = await authenticatedFetch(`${API_BASE}/api/documents/${documentId}/corrections`);
    const data = await res.json();
    const responseData = data.data || data;
    
    if (Array.isArray(responseData)) {
      return responseData;
    }
    
    if (responseData && typeof responseData === 'object' && 'data' in responseData) {
      return Array.isArray(responseData.data) ? responseData.data : [];
    }
    
    return [];
  },

  async saveCorrection(documentId: string, correction: Correction): Promise<Correction> {
    const res = await authenticatedFetch(`${API_BASE}/api/documents/${documentId}/corrections`, {
      method: "POST",
      body: JSON.stringify(correction),
    });
    const data = await res.json();
    return data.data || data;
  },

  async updateCorrectionStatus(correctionId: string, status: Correction["status"], method?: string): Promise<void> {
    await authenticatedFetch(`${API_BASE}/api/corrections/${correctionId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, method }),
    });
  },

  async getAnnotations(documentId: string): Promise<Annotation[]> {
    const res = await authenticatedFetch(`${API_BASE}/api/documents/${documentId}/annotations`);
    const data = await res.json();
    const responseData = data.data || data;
    
    if (Array.isArray(responseData)) {
      return responseData;
    }
    
    if (responseData && typeof responseData === 'object' && 'data' in responseData) {
      return Array.isArray(responseData.data) ? responseData.data : [];
    }
    
    return [];
  },

  async saveAnnotation(documentId: string, annotation: Annotation): Promise<Annotation> {
    const res = await authenticatedFetch(`${API_BASE}/api/documents/${documentId}/annotations`, {
      method: "POST",
      body: JSON.stringify(annotation),
    });
    const data = await res.json();
    return data.data || data;
  },

  async deleteAnnotation(annotationId: string): Promise<void> {
    await authenticatedFetch(`${API_BASE}/api/annotations/${annotationId}`, {
      method: "DELETE",
    });
  },

  async getCrossDocumentValidations(claimId: string): Promise<CrossDocumentValidation[]> {
    const res = await authenticatedFetch(`${API_BASE}/api/claims/${claimId}/validations`);
    const data = await res.json();
    const responseData = data.data || data;
    
    if (Array.isArray(responseData)) {
      return responseData;
    }
    
    if (responseData && typeof responseData === 'object' && 'data' in responseData) {
      return Array.isArray(responseData.data) ? responseData.data : [];
    }
    
    return [];
  },

  async validateCrossDocument(claimId: string): Promise<CrossDocumentValidation[]> {
    // Try new endpoint first, fallback to old one
    try {
      const res = await authenticatedFetch(`${API_BASE}/api/claims/${claimId}/validate`, {
        method: "POST",
      });
      const data = await res.json();
      return data.validations || data.data?.validations || [];
    } catch (e) {
      // Fallback to old endpoint
      const res = await authenticatedFetch(`${API_BASE}/api/claims/${claimId}/validate-cross-document`, {
        method: "POST",
      });
      const data = await res.json();
      return data.validations || data.data?.validations || [];
    }
  },

  async updateCrossDocumentValidationStatus(
    validationId: string,
    status: CrossDocumentValidation["status"],
    resolvedValue?: string
  ): Promise<void> {
    await authenticatedFetch(`${API_BASE}/api/cross-document-validations/${validationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, resolved_value: resolvedValue }),
    });
  },

  async resolveCrossDocValidation(validationId: string, resolvedValue: string): Promise<void> {
    await authenticatedFetch(`${API_BASE}/api/validations/${validationId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolved_value: resolvedValue }),
    });
  },

  async escalateCrossDocValidation(validationId: string, reason: string): Promise<void> {
    await authenticatedFetch(`${API_BASE}/api/validations/${validationId}/escalate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  async saveCorrectionPayload(payload: DocumentCorrectionPayload): Promise<void> {
    await authenticatedFetch(`${API_BASE}/api/correction-payload`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
