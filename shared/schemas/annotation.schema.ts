import { z } from "zod";
import { LocationSchema } from "./correction.schema";

/**
 * Annotation Types
 */
export const AnnotationTypeSchema = z.enum([
  "highlight",     // Background color on text
  "comment",       // Sticky note / popup
  "flag",          // Icon marker
  "strikethrough", // Line through text
  "underline",     // Line under text
]);

export type AnnotationType = z.infer<typeof AnnotationTypeSchema>;

/**
 * Annotation Schema - For visual markers and notes on PDFs
 */
export const AnnotationSchema = z.object({
  id: z.string().uuid(),
  type: AnnotationTypeSchema,
  location: LocationSchema,
  
  // Content
  text: z.string().optional(),        // For comments
  color: z.string().optional(),       // Hex color (e.g., "#FFFF00")
  
  // Metadata
  created_by: z.string(),
  created_at: z.string().datetime(),
  
  // Linkage
  related_correction_id: z.string().uuid().optional(),
  related_validation_id: z.string().uuid().optional(),
});

export type Annotation = z.infer<typeof AnnotationSchema>;
