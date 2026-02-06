import { v4 as uuidv4 } from "uuid";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { Correction, Location } from "../../shared/schemas/correction.schema";
import type { Annotation } from "../../shared/schemas/annotation.schema";
import type { CrossDocumentValidation, DocumentValue } from "../../shared/schemas/cross-document-validation.schema";
import {
  getActiveSchema as getActiveSchemaFromStore,
  saveActiveSchema as saveActiveSchemaToStore,
  deleteActiveSchema as deleteActiveSchemaFromStore,
  getSchemaInfo as getSchemaInfoFromStore,
} from "../schema-store";

export interface CorrectionPayloadResult {
  claimId: string;
  claimContext: {
    claimNumber: string;
    policyNumber: string;
    insuredName: string;
    dateOfLoss?: string;
    propertyAddress?: string;
  };
  documents: Array<{
    documentId: string;
    documentType: string;
    sourceFilename: string;
    pageCount?: number;
    corrections: Correction[];
    annotations: Annotation[];
  }>;
  crossDocumentValidations: CrossDocumentValidation[];
  summary: {
    totalCorrections: number;
    totalAnnotations: number;
    totalCrossDocFlags: number;
    severityCounts: { critical: number; warning: number; info: number };
    confidenceAverage: number;
  };
  correctionJobId: string;
  generatedAt: string;
}

export function isClaimsIQPayload(data: any): boolean {
  return (
    data &&
    typeof data === "object" &&
    typeof data.correction_job_id === "string" &&
    typeof data.claim_context === "object" &&
    Array.isArray(data.documents)
  );
}

export async function getActiveSchema(): Promise<any | null> {
  return getActiveSchemaFromStore();
}

export async function getSchemaInfo(): Promise<{
  version: string;
  title: string;
  schema: any;
  hasCustomSchema: boolean;
}> {
  return getSchemaInfoFromStore();
}

export async function getSchemaVersion(): Promise<string> {
  const info = await getSchemaInfoFromStore();
  return info.version;
}

export async function getSchemaTitle(): Promise<string> {
  const info = await getSchemaInfoFromStore();
  return info.title;
}

export async function saveActiveSchema(
  schemaContent: any,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  return saveActiveSchemaToStore(schemaContent, userId);
}

export async function deleteActiveSchema(): Promise<{ success: boolean; error?: string }> {
  return deleteActiveSchemaFromStore();
}

export async function validateAgainstSchema(payload: any): Promise<{ valid: boolean; errors?: string[] }> {
  const schema = await getActiveSchema();
  if (!schema) {
    return { valid: true };
  }

  try {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const valid = validate(payload);
    if (!valid && validate.errors) {
      return {
        valid: false,
        errors: validate.errors.map(
          (e) => `${e.instancePath || "/"}: ${e.message}`
        ),
      };
    }
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      errors: [`Schema compilation error: ${err instanceof Error ? err.message : "unknown error"}`],
    };
  }
}

function mapLocation(loc: any): Location {
  const result: any = {};

  if (loc?.bbox) {
    result.bbox = {
      pageIndex: (loc.page || 1) - 1,
      left: loc.bbox.x || 0,
      top: loc.bbox.y || 0,
      width: loc.bbox.width || 100,
      height: loc.bbox.height || 20,
    };
  }

  if (loc?.search_text) {
    result.search_text = {
      text: loc.search_text,
      occurrence: 1,
      context_before: loc.text_context || undefined,
    };
  }

  if (!result.bbox && !result.search_text) {
    result.search_text = {
      text: loc?.text_context || "unknown",
      occurrence: 1,
    };
  }

  return result as Location;
}

function mapSeverityForIssue(severity: string): "critical" | "warning" | "info" {
  switch (severity) {
    case "critical": return "critical";
    case "warning": return "warning";
    case "info": return "info";
    case "high": return "critical";
    case "medium": return "warning";
    case "low": return "info";
    default: return "warning";
  }
}

function mapRecommendedAction(action?: string): "auto_correct" | "flag_for_review" | "escalate" | "informational" {
  switch (action) {
    case "auto_correct": return "auto_correct";
    case "flag_for_review": return "flag_for_review";
    case "escalate": return "escalate";
    case "informational": return "informational";
    default: return "flag_for_review";
  }
}

export function adaptCorrectionPayload(payload: any): CorrectionPayloadResult {
  const claimCtx = payload.claim_context;
  const claimId = claimCtx.claim_number || `CLM-${Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();

  const documents = (payload.documents || []).map((doc: any) => {
    const corrections: Correction[] = (doc.corrections || []).map((corr: any) => ({
      id: uuidv4(),
      claim_id: claimId,
      document_id: doc.document_id,
      type: corr.type,
      severity: corr.severity,
      location: mapLocation(corr.location),
      found_value: corr.original_value,
      expected_value: corr.corrected_value,
      confidence: corr.confidence ?? 0.5,
      requires_human_review: corr.requires_human_review ?? true,
      recommended_action: corr.requires_human_review === false && (corr.confidence ?? 0) >= 0.95
        ? ("auto_correct" as const)
        : ("flag_for_review" as const),
      evidence: {
        source_document: corr.evidence?.source_document_id || doc.document_id,
        source_field: corr.evidence?.source_field,
        reasoning: corr.reason,
      },
      status: "pending" as const,
    }));

    const annotations: Annotation[] = (doc.annotations || []).map((ann: any) => ({
      id: uuidv4(),
      type: ann.type,
      location: mapLocation(ann.location),
      text: ann.message,
      color: ann.color || "#FFFF00",
      created_by: "claims-iq-core",
      created_at: now,
    }));

    return {
      documentId: doc.document_id,
      documentType: doc.document_type,
      sourceFilename: doc.source_filename,
      pageCount: doc.page_count,
      corrections,
      annotations,
    };
  });

  const crossDocumentValidations: CrossDocumentValidation[] = (
    payload.cross_document_validations || []
  ).map((xval: any) => {
    const docs: DocumentValue[] = (xval.occurrences || []).map((occ: any) => ({
      document_id: occ.document_id,
      document_name: occ.document_type || occ.document_id,
      found_value: occ.value,
      location: mapLocation(occ.location),
      confidence: 1.0,
    }));

    if (docs.length < 2) {
      while (docs.length < 2) {
        docs.push({
          document_id: "unknown",
          document_name: "unknown",
          found_value: "(not found)",
          location: { search_text: { text: "unknown", occurrence: 1 } } as Location,
          confidence: 0,
        });
      }
    }

    return {
      id: uuidv4(),
      field: xval.field_name as any,
      severity: xval.severity,
      documents: docs,
      expected_value: xval.expected_value || undefined,
      recommended_action: mapRecommendedAction(xval.recommended_action),
      reasoning: xval.message,
      status: "pending" as const,
    };
  });

  const summary = payload.summary || {
    total_corrections: documents.reduce((sum: number, d: any) => sum + d.corrections.length, 0),
    total_annotations: documents.reduce((sum: number, d: any) => sum + d.annotations.length, 0),
    total_cross_doc_flags: crossDocumentValidations.length,
    severity_counts: { critical: 0, warning: 0, info: 0 },
    confidence_average: 0,
  };

  return {
    claimId,
    claimContext: {
      claimNumber: claimCtx.claim_number,
      policyNumber: claimCtx.policy_number,
      insuredName: claimCtx.insured_name,
      dateOfLoss: claimCtx.date_of_loss,
      propertyAddress: claimCtx.property_address,
    },
    documents,
    crossDocumentValidations,
    summary: {
      totalCorrections: summary.total_corrections,
      totalAnnotations: summary.total_annotations,
      totalCrossDocFlags: summary.total_cross_doc_flags,
      severityCounts: summary.severity_counts || { critical: 0, warning: 0, info: 0 },
      confidenceAverage: summary.confidence_average || 0,
    },
    correctionJobId: payload.correction_job_id,
    generatedAt: payload.generated_at,
  };
}

export function adaptToIssueBundle(payload: any, documentId: string) {
  const adapted = adaptCorrectionPayload(payload);

  const allIssues = adapted.documents.flatMap((doc) =>
    doc.corrections.map((corr) => ({
      issueId: corr.id,
      type: corr.type,
      severity: mapSeverityForIssue(corr.severity),
      confidence: corr.confidence,
      pageIndex: corr.location.bbox?.pageIndex ?? 0,
      rect: corr.location.bbox
        ? {
            left: corr.location.bbox.left,
            top: corr.location.bbox.top,
            width: corr.location.bbox.width,
            height: corr.location.bbox.height,
          }
        : { left: 0, top: 0, width: 100, height: 20 },
      foundValue: corr.found_value,
      expectedValue: corr.expected_value,
      suggestedFix: {
        strategy: corr.requires_human_review ? ("manual" as const) : ("auto" as const),
        requiresApproval: corr.requires_human_review,
        fallbackOrder: ["form_field" as const, "content_edit" as const, "redaction_overlay" as const],
      },
      label: corr.evidence.reasoning,
      status: "OPEN" as const,
    }))
  );

  return {
    schemaVersion: "1.0.0",
    claimId: adapted.claimId,
    document: {
      documentId,
      fingerprint: adapted.correctionJobId,
    },
    issues: allIssues,
  };
}
