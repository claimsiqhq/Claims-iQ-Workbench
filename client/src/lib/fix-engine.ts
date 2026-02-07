import type { Issue } from "@shared/schema";
import type {
  Correction,
  Annotation,
  DocumentCorrectionPayload,
} from "@shared/schemas";
import type { PDFProcessorAdapter, CorrectionResult } from "./adapters/pdf-processor.interface";
import { LocationResolver } from "./location-resolver";

/**
 * Processing Result
 */
export interface ProcessingResult {
  corrections: Array<{ id: string } & CorrectionResult>;
  annotations: Array<{ id: string } & { success: boolean; native_id: string; error?: string }>;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Refactored Fix Engine
 * Uses adapter pattern and location resolver for product-agnostic PDF processing
 */
export class FixEngine {
  private adapter: PDFProcessorAdapter;
  private locationResolver: LocationResolver;

  constructor(adapter: PDFProcessorAdapter, instance: any) {
    this.adapter = adapter;
    this.locationResolver = new LocationResolver(instance);
  }

  /**
   * Apply a single correction
   */
  async applyCorrection(correction: Correction): Promise<CorrectionResult> {
    // Step 1: Resolve location (dual strategy)
    const resolvedLocation = await this.locationResolver.resolveLocation(
      correction.location
    );

    if (!resolvedLocation) {
      return {
        success: false,
        method: "content_edit",
        error: "Could not resolve location (bbox and search_text both failed)",
      };
    }

    // Step 2: Apply via adapter (decoupled from Nutrient)
    const correctionWithResolvedLocation: Correction = {
      ...correction,
      location: { bbox: resolvedLocation.bbox },
    };

    return this.adapter.applyTextCorrection(correctionWithResolvedLocation);
  }

  /**
   * Apply an annotation
   */
  async applyAnnotation(annotation: Annotation): Promise<{ success: boolean; native_id: string; error?: string }> {
    const resolvedLocation = await this.locationResolver.resolveLocation(
      annotation.location
    );

    if (!resolvedLocation) {
      return {
        success: false,
        native_id: "",
        error: "Could not resolve annotation location",
      };
    }

    const annotationWithResolvedLocation: Annotation = {
      ...annotation,
      location: { bbox: resolvedLocation.bbox },
    };

    return this.adapter.createAnnotation(annotationWithResolvedLocation);
  }

  /**
   * Process a full correction payload
   */
  async processCorrectionPayload(
    payload: DocumentCorrectionPayload
  ): Promise<ProcessingResult> {
    const results: ProcessingResult = {
      corrections: [],
      annotations: [],
      errors: [],
    };

    for (const doc of payload.documents) {
      // Apply corrections
      for (const correction of doc.corrections) {
        if (
          correction.recommended_action === "auto_correct" &&
          !correction.requires_human_review
        ) {
          try {
            const result = await this.applyCorrection(correction);
            results.corrections.push({
              id: correction.id,
              ...result,
            });
          } catch (err) {
            results.errors.push({
              id: correction.id,
              error: err instanceof Error ? err.message : "Unknown error",
            });
          }
        }
      }

      // Create annotations
      for (const annotation of doc.annotations) {
        try {
          const result = await this.applyAnnotation(annotation);
          results.annotations.push({
            id: annotation.id,
            ...result,
          });
        } catch (err) {
          results.errors.push({
            id: annotation.id,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    }

    return results;
  }

  /**
   * Legacy support: Apply fix using old Issue schema
   * This maintains backward compatibility while migrating to new schema
   */
  async applyFix(issue: Issue): Promise<{ success: boolean; method?: string; error?: string }> {
    // Convert Issue to Correction format
    const correction = migrateIssueToCorrection(issue);
    
    // Use new correction flow
    const result = await this.applyCorrection(correction);
    
    return {
      success: result.success,
      method: result.method,
      error: result.error,
    };
  }
}

/**
 * Migration helper: Convert old Issue schema to new Correction schema
 */
export function migrateIssueToCorrection(issue: Issue): Correction {
  const location = issue.rect
    ? {
        bbox: {
          pageIndex: issue.pageIndex,
          left: issue.rect.left,
          top: issue.rect.top,
          width: issue.rect.width,
          height: issue.rect.height,
        },
      }
    : {
        search_text: {
          text: issue.searchText || issue.foundValue || issue.expectedValue || "unknown",
          occurrence: 1,
        },
      };
  
  return {
    id: issue.issueId,
    type: mapIssueType(issue.type),
    severity: mapSeverity(issue.severity),
    location,
    found_value: issue.foundValue || "",
    expected_value: issue.expectedValue || "",
    confidence: issue.confidence,
    requires_human_review: issue.suggestedFix.requiresApproval,
    recommended_action:
      issue.suggestedFix.strategy === "auto"
        ? "auto_correct"
        : "flag_for_review",
    evidence: {
      reasoning: issue.label || "Detected by analysis",
    },
    form_field_name: issue.formFieldName,
    status: mapStatus(issue.status),
  };
}

/**
 * Map old issue type string to new CorrectionType
 */
function mapIssueType(type: string): Correction["type"] {
  const mapping: Record<string, Correction["type"]> = {
    typo: "typo",
    date: "date_error",
    phone: "phone_format",
    name: "name_mismatch",
    address: "address_error",
    numeric: "numeric_error",
    missing: "missing_value",
    format: "format_standardization",
    inconsistency: "data_inconsistency",
  };

  const normalized = type.toLowerCase().replace(/[^a-z]/g, "");
  return mapping[normalized] || "typo";
}

/**
 * Map old severity to new Severity
 */
function mapSeverity(
  severity: Issue["severity"]
): Correction["severity"] {
  const mapping: Record<string, Correction["severity"]> = {
    critical: "critical",
    high: "warning",
    medium: "warning",
    low: "info",
  };

  return mapping[severity] || "info";
}

/**
 * Map old status to new status
 */
function mapStatus(
  status?: Issue["status"]
): Correction["status"] {
  if (!status) return "pending";

  const mapping: Record<string, Correction["status"]> = {
    OPEN: "pending",
    APPLIED: "applied",
    MANUAL: "manual",
    REJECTED: "rejected",
  };

  return mapping[status] || "pending";
}
