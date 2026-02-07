import { z } from "zod";
import { LocationSchema } from "./correction.schema";
import { SeveritySchema, RecommendedActionSchema } from "./correction.schema";

/**
 * Validated Fields - Fields that can be cross-checked across documents
 */
export const ValidatedFieldSchema = z.enum([
  "claim_number",
  "policy_number",
  "insured_name",
  "insured_phone",
  "insured_email",
  "date_of_loss",
  "property_address",
  "loss_amount",
  "payment_amount",
  "adjuster_name",
  "adjuster_phone",
  "coverage_type",
  "deductible",
]);

export type ValidatedField = z.infer<typeof ValidatedFieldSchema>;

/**
 * Document Value Reference - Where a value was found in a document
 */
export const DocumentValueSchema = z.object({
  document_id: z.string(),
  document_name: z.string(),
  found_value: z.string(),
  location: LocationSchema,
  confidence: z.number().min(0).max(1),
});

export type DocumentValue = z.infer<typeof DocumentValueSchema>;

/**
 * Cross-Document Validation Schema
 * Detects inconsistencies across multiple documents in a claim
 */
export const CrossDocumentValidationSchema = z.object({
  id: z.string().uuid(),
  claim_id: z.string(),
  field: ValidatedFieldSchema,
  severity: SeveritySchema,
  
  // Document references (must have at least 2 to compare)
  documents: z.array(DocumentValueSchema).min(2),
  
  // Resolution
  expected_value: z.string().optional(),
  recommended_action: RecommendedActionSchema,
  reasoning: z.string(),
  
  // Status
  status: z.enum(["pending", "resolved", "ignored", "escalated"]).default("pending"),
  resolved_value: z.string().optional(),
  resolved_by: z.string().optional(),
  resolved_at: z.string().datetime().optional(),
});

export type CrossDocumentValidation = z.infer<typeof CrossDocumentValidationSchema>;
