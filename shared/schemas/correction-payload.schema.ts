import { z } from "zod";
import { CorrectionSchema } from "./correction.schema";
import { AnnotationSchema } from "./annotation.schema";
import { CrossDocumentValidationSchema } from "./cross-document-validation.schema";

/**
 * Document-level corrections and annotations
 */
export const DocumentCorrectionsSchema = z.object({
  document_id: z.string(),
  document_name: z.string(),
  fingerprint: z.string(),
  corrections: z.array(CorrectionSchema),
  annotations: z.array(AnnotationSchema),
});

export type DocumentCorrections = z.infer<typeof DocumentCorrectionsSchema>;

/**
 * Summary Statistics
 */
export const CorrectionSummarySchema = z.object({
  total_corrections: z.number(),
  auto_correctable: z.number(),
  requires_review: z.number(),
  cross_doc_issues: z.number(),
});

export type CorrectionSummary = z.infer<typeof CorrectionSummarySchema>;

/**
 * Document Correction Payload - Full bundle schema
 * This is the canonical format for Claims IQ Core processing
 */
export const DocumentCorrectionPayloadSchema = z.object({
  schema_version: z.string().default("1.0.0"),
  
  // Claim context
  claim: z.object({
    claim_id: z.string(),
    claim_number: z.string().optional(),
    policy_number: z.string().optional(),
  }),
  
  // Per-document corrections and annotations
  documents: z.array(DocumentCorrectionsSchema),
  
  // Cross-document validations
  cross_document_validations: z.array(CrossDocumentValidationSchema),
  
  // Processing metadata
  processed_at: z.string().datetime(),
  processed_by: z.string(), // AI model version or user
  
  // Summary stats
  summary: CorrectionSummarySchema,
});

export type DocumentCorrectionPayload = z.infer<typeof DocumentCorrectionPayloadSchema>;
