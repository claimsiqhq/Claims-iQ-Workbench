import { z } from "zod";

/**
 * Location Schema - Dual strategy for finding content in PDFs
 * Primary: Precise bbox coordinates
 * Fallback: Text-based search (more resilient to layout changes)
 */
export const LocationSchema = z.object({
  // Primary: Precise coordinates
  bbox: z.object({
    pageIndex: z.number().min(0),
    left: z.number(),
    top: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
  
  // Fallback: Text-based search (more resilient)
  search_text: z.object({
    text: z.string(),
    occurrence: z.number().default(1), // Which occurrence to target
    context_before: z.string().optional(),
    context_after: z.string().optional(),
  }).optional(),
}).refine(
  (data) => data.bbox || data.search_text,
  "Location must have either bbox or search_text"
);

export type Location = z.infer<typeof LocationSchema>;
export type BBox = NonNullable<Location["bbox"]>;

/**
 * Correction Types - Structured types for different error categories
 */
export const CorrectionTypeSchema = z.enum([
  "typo",
  "date_error", 
  "phone_format",
  "name_mismatch",
  "address_error",
  "numeric_error",
  "missing_value",
  "format_standardization",
  "data_inconsistency",
]);

export type CorrectionType = z.infer<typeof CorrectionTypeSchema>;

/**
 * Severity Levels
 */
export const SeveritySchema = z.enum([
  "critical",  // Affects claim validity or payment
  "warning",   // Data quality issue
  "info",      // Cosmetic or informational
]);

export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Recommended Actions
 */
export const RecommendedActionSchema = z.enum([
  "auto_correct",     // High confidence, apply automatically
  "flag_for_review",  // Uncertain, needs human decision
  "escalate",         // Potential fraud or major discrepancy
  "informational",    // No action needed
]);

export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;

/**
 * Canonical Correction Schema - Product-agnostic format
 */
export const CorrectionSchema = z.object({
  id: z.string().uuid(),
  type: CorrectionTypeSchema,
  severity: SeveritySchema,
  
  // Location (dual strategy)
  location: LocationSchema,
  
  // Values
  found_value: z.string(),
  expected_value: z.string(),
  
  // Confidence & Review
  confidence: z.number().min(0).max(1),
  requires_human_review: z.boolean(),
  recommended_action: RecommendedActionSchema,
  
  // Evidence & Audit
  evidence: z.object({
    source_document: z.string().optional(),
    source_field: z.string().optional(),
    reasoning: z.string(),
  }),
  
  // Form field hint (if applicable)
  form_field_name: z.string().optional(),
  
  // Status tracking
  status: z.enum(["pending", "applied", "rejected", "manual"]).default("pending"),
  applied_at: z.string().datetime().optional(),
  applied_by: z.string().optional(),
  applied_method: z.string().optional(),
});

export type Correction = z.infer<typeof CorrectionSchema>;
