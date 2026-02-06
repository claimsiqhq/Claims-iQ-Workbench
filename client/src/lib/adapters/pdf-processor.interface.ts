import type { Correction, Annotation } from "@shared/schemas";

/**
 * Form Field Definition
 */
export interface FormField {
  name: string;
  value: string;
  type?: string;
  required?: boolean;
}

/**
 * Correction Result
 */
export interface CorrectionResult {
  success: boolean;
  method: "form_field" | "content_edit" | "redaction_overlay";
  error?: string;
}

/**
 * Annotation Result
 */
export interface AnnotationResult {
  success: boolean;
  native_id: string; // Processor's internal ID (e.g., Nutrient annotation ID)
  error?: string;
}

/**
 * PDF Processor Adapter Interface
 * 
 * This interface abstracts PDF processing operations so the application
 * can work with any PDF processor (Nutrient, PDF.js, etc.) by implementing
 * this adapter.
 */
export interface PDFProcessorAdapter {
  // Lifecycle
  initialize(instance: any, module?: any): Promise<void>;
  dispose(): Promise<void>;
  
  // Text Corrections
  applyTextCorrection(correction: Correction): Promise<CorrectionResult>;
  
  // Annotations
  createAnnotation(annotation: Annotation): Promise<AnnotationResult>;
  updateAnnotation(id: string, annotation: Partial<Annotation>): Promise<AnnotationResult>;
  deleteAnnotation(id: string): Promise<void>;
  getAnnotations(pageIndex?: number): Promise<Annotation[]>;
  
  // Form Fields
  getFormFields(): Promise<FormField[]>;
  setFormFieldValue(name: string, value: string): Promise<boolean>;
  
  // Content Editing
  supportsContentEditing(): boolean;
  editTextContent(pageIndex: number, textBlockId: string, newText: string): Promise<boolean>;
  
  // Redaction
  createRedactionOverlay(location: Correction["location"], overlayText: string): Promise<boolean>;
  
  // Export
  exportDocument(format: "pdf" | "pdf-a"): Promise<Blob>;
  getInstantJSON(): Promise<any>;
}
