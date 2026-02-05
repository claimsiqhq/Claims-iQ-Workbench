# Claims IQ Core — Processing Engine Update Plan

## Executive Summary

This document outlines the complete plan to align the Claims File Correction Workbench with the Claims IQ Core architecture. The update transforms the current implementation from a direct Nutrient SDK integration to a product-agnostic canonical format with a pluggable adapter layer.

---

## Current State Analysis

### What Exists Today

| Component | Status | Notes |
|-----------|--------|-------|
| Nutrient Web SDK Viewer | ✅ Working | CDN-based PDF viewing |
| Document Engine Support | ✅ Optional | JWT-authenticated server mode |
| Fix Engine | ✅ Basic | 3 strategies: form_field, content_edit, redaction_overlay |
| Issue Detection | ✅ Schema | Basic issue schema with rect/severity/confidence |
| Audit Logging | ✅ Basic | Tracks applied/rejected actions |
| Human-in-the-Loop | ✅ UI | Approve/reject workflow in workbench |

### What's Missing

| Component | Gap | Priority |
|-----------|-----|----------|
| Canonical Correction Schema | Not product-agnostic | P0 - Critical |
| Adapter Layer | Direct SDK calls | P0 - Critical |
| Annotation Support | No annotations schema/API | P1 - High |
| Cross-Document Validation | Not implemented | P1 - High |
| Dual Location Strategy | No search_text fallback | P2 - Medium |
| Structured Correction Types | Generic type field | P2 - Medium |
| Evidence Tracking | Minimal audit trail | P3 - Low |

---

## Phase 1: Canonical Schema Design (P0)

### 1.1 Correction Schema

Create a product-agnostic correction format that can be translated to any PDF processor.

```typescript
// shared/schemas/correction.schema.ts

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
});

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

export const SeveritySchema = z.enum([
  "critical",  // Affects claim validity or payment
  "warning",   // Data quality issue
  "info",      // Cosmetic or informational
]);

export const RecommendedActionSchema = z.enum([
  "auto_correct",     // High confidence, apply automatically
  "flag_for_review",  // Uncertain, needs human decision
  "escalate",         // Potential fraud or major discrepancy
  "informational",    // No action needed
]);

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
```

### 1.2 Annotation Schema

```typescript
// shared/schemas/annotation.schema.ts

export const AnnotationTypeSchema = z.enum([
  "highlight",     // Background color on text
  "comment",       // Sticky note / popup
  "flag",          // Icon marker
  "strikethrough", // Line through text
  "underline",     // Line under text
]);

export const AnnotationSchema = z.object({
  id: z.string().uuid(),
  type: AnnotationTypeSchema,
  location: LocationSchema,
  
  // Content
  text: z.string().optional(),        // For comments
  color: z.string().optional(),       // Hex color
  
  // Metadata
  created_by: z.string(),
  created_at: z.string().datetime(),
  
  // Linkage
  related_correction_id: z.string().uuid().optional(),
  related_validation_id: z.string().uuid().optional(),
});
```

### 1.3 Cross-Document Validation Schema

```typescript
// shared/schemas/cross-document-validation.schema.ts

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

export const CrossDocumentValidationSchema = z.object({
  id: z.string().uuid(),
  field: ValidatedFieldSchema,
  severity: SeveritySchema,
  
  // Document references
  documents: z.array(z.object({
    document_id: z.string(),
    document_name: z.string(),
    found_value: z.string(),
    location: LocationSchema,
    confidence: z.number().min(0).max(1),
  })).min(2),
  
  // Resolution
  expected_value: z.string().optional(),
  recommended_action: RecommendedActionSchema,
  reasoning: z.string(),
  
  // Status
  status: z.enum(["pending", "resolved", "ignored"]).default("pending"),
  resolved_value: z.string().optional(),
  resolved_by: z.string().optional(),
  resolved_at: z.string().datetime().optional(),
});
```

### 1.4 Document Correction Payload (Full Bundle)

```typescript
// shared/schemas/correction-payload.schema.ts

export const DocumentCorrectionPayloadSchema = z.object({
  schema_version: z.string().default("1.0.0"),
  
  // Claim context
  claim: z.object({
    claim_id: z.string(),
    claim_number: z.string().optional(),
    policy_number: z.string().optional(),
  }),
  
  // Per-document corrections and annotations
  documents: z.array(z.object({
    document_id: z.string(),
    document_name: z.string(),
    fingerprint: z.string(),
    corrections: z.array(CorrectionSchema),
    annotations: z.array(AnnotationSchema),
  })),
  
  // Cross-document validations
  cross_document_validations: z.array(CrossDocumentValidationSchema),
  
  // Processing metadata
  processed_at: z.string().datetime(),
  processed_by: z.string(), // AI model version or user
  
  // Summary stats
  summary: z.object({
    total_corrections: z.number(),
    auto_correctable: z.number(),
    requires_review: z.number(),
    cross_doc_issues: z.number(),
  }),
});
```

---

## Phase 2: Adapter Layer Architecture (P0)

### 2.1 Adapter Interface

```typescript
// client/src/lib/adapters/pdf-processor.interface.ts

export interface PDFProcessorAdapter {
  // Lifecycle
  initialize(instance: any): Promise<void>;
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
  createRedactionOverlay(location: Location, overlayText: string): Promise<boolean>;
  
  // Export
  exportDocument(format: "pdf" | "pdf-a"): Promise<Blob>;
  getInstantJSON(): Promise<any>;
}

export interface CorrectionResult {
  success: boolean;
  method: "form_field" | "content_edit" | "redaction_overlay";
  error?: string;
}

export interface AnnotationResult {
  success: boolean;
  native_id: string; // Nutrient's internal ID
  error?: string;
}
```

### 2.2 Nutrient Adapter Implementation

```typescript
// client/src/lib/adapters/nutrient.adapter.ts

export class NutrientAdapter implements PDFProcessorAdapter {
  private instance: any;
  private Annotations: any;
  private Geometry: any;
  
  async initialize(instance: any): Promise<void> {
    this.instance = instance;
    this.Annotations = await instance.Annotations;
    this.Geometry = await instance.Geometry;
  }
  
  async dispose(): Promise<void> {
    if (this.instance?.unload) {
      await this.instance.unload();
    }
  }
  
  async applyTextCorrection(correction: Correction): Promise<CorrectionResult> {
    // Try strategies in order based on correction type
    const strategies = this.getStrategiesForCorrection(correction);
    
    for (const strategy of strategies) {
      const result = await this.tryStrategy(strategy, correction);
      if (result.success) {
        return result;
      }
    }
    
    return { success: false, method: "content_edit", error: "All strategies failed" };
  }
  
  private getStrategiesForCorrection(correction: Correction): string[] {
    // Form field corrections prefer form_field strategy
    if (correction.form_field_name) {
      return ["form_field", "content_edit", "redaction_overlay"];
    }
    
    // Date/numeric errors may need redaction if content editing fails
    if (["date_error", "numeric_error"].includes(correction.type)) {
      return ["content_edit", "redaction_overlay"];
    }
    
    // Default order
    return ["content_edit", "redaction_overlay"];
  }
  
  async createAnnotation(annotation: Annotation): Promise<AnnotationResult> {
    const bbox = annotation.location.bbox;
    if (!bbox) {
      return { success: false, native_id: "", error: "No bbox location" };
    }
    
    const rect = new this.Geometry.Rect({
      left: bbox.left,
      top: bbox.top,
      width: bbox.width,
      height: bbox.height,
    });
    
    let nativeAnnotation: any;
    
    switch (annotation.type) {
      case "highlight":
        nativeAnnotation = new this.Annotations.HighlightAnnotation({
          pageIndex: bbox.pageIndex,
          rects: [rect],
          color: this.hexToColor(annotation.color || "#FFFF00"),
        });
        break;
        
      case "comment":
        nativeAnnotation = new this.Annotations.TextAnnotation({
          pageIndex: bbox.pageIndex,
          boundingBox: rect,
          text: { value: annotation.text || "" },
        });
        break;
        
      case "strikethrough":
        nativeAnnotation = new this.Annotations.StrikeOutAnnotation({
          pageIndex: bbox.pageIndex,
          rects: [rect],
        });
        break;
        
      case "underline":
        nativeAnnotation = new this.Annotations.UnderlineAnnotation({
          pageIndex: bbox.pageIndex,
          rects: [rect],
        });
        break;
        
      case "flag":
        nativeAnnotation = new this.Annotations.StampAnnotation({
          pageIndex: bbox.pageIndex,
          boundingBox: rect,
          stampType: "Approved", // Or custom flag type
        });
        break;
    }
    
    if (!nativeAnnotation) {
      return { success: false, native_id: "", error: "Unknown annotation type" };
    }
    
    const created = await this.instance.create(nativeAnnotation);
    return { success: true, native_id: created.id };
  }
  
  // ... additional methods
}
```

### 2.3 Adapter Factory

```typescript
// client/src/lib/adapters/adapter-factory.ts

export type PDFProcessorType = "nutrient" | "pdfjs" | "custom";

export class PDFAdapterFactory {
  static async create(
    type: PDFProcessorType,
    instance: any
  ): Promise<PDFProcessorAdapter> {
    let adapter: PDFProcessorAdapter;
    
    switch (type) {
      case "nutrient":
        adapter = new NutrientAdapter();
        break;
      case "pdfjs":
        // Future: PDF.js adapter for basic viewing
        throw new Error("PDF.js adapter not implemented");
      default:
        throw new Error(`Unknown processor type: ${type}`);
    }
    
    await adapter.initialize(instance);
    return adapter;
  }
}
```

---

## Phase 3: Cross-Document Validation Engine (P1)

### 3.1 Validation Engine

```typescript
// server/services/cross-document-validator.ts

export class CrossDocumentValidator {
  private fieldExtractors: Map<ValidatedField, FieldExtractor>;
  
  async validateClaim(
    claimId: string,
    documents: ExtractedDocument[]
  ): Promise<CrossDocumentValidation[]> {
    const validations: CrossDocumentValidation[] = [];
    
    for (const field of VALIDATED_FIELDS) {
      const values = this.extractFieldFromDocuments(field, documents);
      
      if (values.length < 2) continue; // Need at least 2 docs to compare
      
      const uniqueValues = new Set(values.map(v => this.normalizeValue(v.value)));
      
      if (uniqueValues.size > 1) {
        // Inconsistency detected
        validations.push({
          id: generateUUID(),
          field,
          severity: this.getSeverityForField(field),
          documents: values,
          expected_value: this.determineExpectedValue(values),
          recommended_action: this.determineAction(field, values),
          reasoning: this.generateReasoning(field, values),
          status: "pending",
        });
      }
    }
    
    return validations;
  }
  
  private getSeverityForField(field: ValidatedField): Severity {
    const criticalFields = ["claim_number", "policy_number", "loss_amount"];
    const warningFields = ["insured_name", "date_of_loss", "property_address"];
    
    if (criticalFields.includes(field)) return "critical";
    if (warningFields.includes(field)) return "warning";
    return "info";
  }
  
  private determineAction(
    field: ValidatedField,
    values: ExtractedValue[]
  ): RecommendedAction {
    // High confidence + non-critical = auto_correct
    const avgConfidence = values.reduce((a, b) => a + b.confidence, 0) / values.length;
    
    if (avgConfidence > 0.9 && this.getSeverityForField(field) !== "critical") {
      return "auto_correct";
    }
    
    // Large discrepancies in amounts = escalate
    if (field === "loss_amount" || field === "payment_amount") {
      const amounts = values.map(v => parseFloat(v.value.replace(/[^0-9.]/g, "")));
      const variance = this.calculateVariance(amounts);
      if (variance > 0.2) return "escalate";
    }
    
    return "flag_for_review";
  }
}
```

### 3.2 Field Extraction Service

```typescript
// server/services/field-extractor.ts

export class FieldExtractor {
  async extractFromDocument(
    documentId: string,
    content: string | PDFContent
  ): Promise<ExtractedFields> {
    // Use AI/OCR to extract key fields
    const fields: ExtractedFields = {};
    
    // Pattern-based extraction for common fields
    fields.claim_number = this.extractPattern(content, CLAIM_NUMBER_PATTERNS);
    fields.policy_number = this.extractPattern(content, POLICY_NUMBER_PATTERNS);
    fields.date_of_loss = this.extractDate(content, DATE_OF_LOSS_PATTERNS);
    fields.insured_name = this.extractName(content, INSURED_NAME_PATTERNS);
    // ... etc
    
    return fields;
  }
  
  private extractPattern(
    content: string,
    patterns: RegExp[]
  ): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return {
          value: match[1],
          confidence: 0.85,
          location: this.findLocation(content, match[0]),
        };
      }
    }
    return null;
  }
}
```

---

## Phase 4: Dual Location Strategy (P2)

### 4.1 Location Resolver

```typescript
// client/src/lib/location-resolver.ts

export class LocationResolver {
  constructor(private pdfInstance: any) {}
  
  async resolveLocation(location: Location): Promise<ResolvedLocation | null> {
    // Try bbox first (most precise)
    if (location.bbox) {
      const verified = await this.verifyBbox(location.bbox);
      if (verified) {
        return { type: "bbox", bbox: location.bbox };
      }
    }
    
    // Fallback to search_text
    if (location.search_text) {
      const found = await this.findBySearchText(location.search_text);
      if (found) {
        return { type: "search_text", bbox: found };
      }
    }
    
    return null;
  }
  
  private async findBySearchText(searchText: SearchText): Promise<BBox | null> {
    const results = await this.pdfInstance.search(searchText.text);
    
    if (results.length === 0) return null;
    
    // Get the specified occurrence
    const targetIndex = (searchText.occurrence || 1) - 1;
    if (targetIndex >= results.length) return null;
    
    const result = results[targetIndex];
    
    // Verify context if provided
    if (searchText.context_before || searchText.context_after) {
      const verified = await this.verifyContext(
        result,
        searchText.context_before,
        searchText.context_after
      );
      if (!verified) return null;
    }
    
    return {
      pageIndex: result.pageIndex,
      left: result.rect.left,
      top: result.rect.top,
      width: result.rect.width,
      height: result.rect.height,
    };
  }
}
```

---

## Phase 5: Updated Fix Engine (P0)

### 5.1 Refactored Fix Engine

```typescript
// client/src/lib/fix-engine.ts (updated)

export class FixEngine {
  private adapter: PDFProcessorAdapter;
  private locationResolver: LocationResolver;
  
  constructor(adapter: PDFProcessorAdapter, instance: any) {
    this.adapter = adapter;
    this.locationResolver = new LocationResolver(instance);
  }
  
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
    const correctionWithResolvedLocation = {
      ...correction,
      location: { bbox: resolvedLocation.bbox },
    };
    
    return this.adapter.applyTextCorrection(correctionWithResolvedLocation);
  }
  
  async applyAnnotation(annotation: Annotation): Promise<AnnotationResult> {
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
    
    const annotationWithResolvedLocation = {
      ...annotation,
      location: { bbox: resolvedLocation.bbox },
    };
    
    return this.adapter.createAnnotation(annotationWithResolvedLocation);
  }
  
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
        if (correction.recommended_action === "auto_correct" && 
            !correction.requires_human_review) {
          const result = await this.applyCorrection(correction);
          results.corrections.push({ 
            id: correction.id, 
            ...result 
          });
        }
      }
      
      // Create annotations
      for (const annotation of doc.annotations) {
        const result = await this.applyAnnotation(annotation);
        results.annotations.push({ 
          id: annotation.id, 
          ...result 
        });
      }
    }
    
    return results;
  }
}
```

---

## Phase 6: UI Updates (P2)

### 6.1 Annotation Panel Component

Add a new panel to the workbench for managing annotations:

- View all annotations by type
- Create new annotations (highlight, comment, flag)
- Link annotations to corrections
- Filter annotations by page/type/author

### 6.2 Cross-Document Validation Panel

Add a validation panel showing:

- Field inconsistencies across documents
- Side-by-side comparison view
- Resolution workflow (select correct value, apply to all)
- Escalation workflow for suspicious discrepancies

### 6.3 Enhanced Issue Card

Update issue cards to show:

- Correction type (typo, date_error, etc.)
- Dual location indicator (bbox/search_text)
- Evidence source
- Recommended action badge

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Define canonical schemas in `shared/schemas/`
- [ ] Create Nutrient adapter interface and implementation
- [ ] Refactor FixEngine to use adapter
- [ ] Update existing Issue schema for backward compatibility

### Phase 2: Dual Location (Week 2-3)
- [ ] Implement LocationResolver
- [ ] Add search_text to correction payloads
- [ ] Update fix strategies to use resolved locations
- [ ] Test with various PDF layouts

### Phase 3: Annotations (Week 3-4)
- [ ] Implement annotation creation/management in adapter
- [ ] Add annotation panel to workbench UI
- [ ] Create annotation-correction linking
- [ ] Add annotation export to Instant JSON

### Phase 4: Cross-Document Validation (Week 4-6)
- [ ] Build field extraction service
- [ ] Implement CrossDocumentValidator
- [ ] Add validation results to correction payload
- [ ] Create validation resolution UI
- [ ] Add escalation workflow

### Phase 5: Polish & Testing (Week 6-7)
- [ ] Integration testing with real claim files
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] Documentation

---

## Migration Strategy

### Backward Compatibility

The existing `IssueSchema` will be maintained and mapped to the new `CorrectionSchema`:

```typescript
function migrateIssueToCorrection(issue: Issue): Correction {
  return {
    id: issue.issueId,
    type: mapIssueType(issue.type),
    severity: mapSeverity(issue.severity),
    location: {
      bbox: {
        pageIndex: issue.pageIndex,
        ...issue.rect,
      },
    },
    found_value: issue.foundValue || "",
    expected_value: issue.expectedValue || "",
    confidence: issue.confidence,
    requires_human_review: issue.suggestedFix.requiresApproval,
    recommended_action: issue.suggestedFix.strategy === "auto" 
      ? "auto_correct" 
      : "flag_for_review",
    evidence: {
      reasoning: issue.label || "Detected by analysis",
    },
    form_field_name: issue.formFieldName,
    status: mapStatus(issue.status),
  };
}
```

### Database Migration

Add new tables for the canonical format while keeping existing tables:

```sql
-- New tables
CREATE TABLE corrections (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  location JSONB NOT NULL,
  found_value TEXT,
  expected_value TEXT,
  confidence DECIMAL(3,2),
  requires_human_review BOOLEAN DEFAULT true,
  recommended_action VARCHAR(30),
  evidence JSONB,
  form_field_name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending',
  applied_at TIMESTAMP,
  applied_by UUID,
  applied_method VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE annotations (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  type VARCHAR(30) NOT NULL,
  location JSONB NOT NULL,
  text TEXT,
  color VARCHAR(7),
  related_correction_id UUID REFERENCES corrections(id),
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cross_document_validations (
  id UUID PRIMARY KEY,
  claim_id UUID REFERENCES claims(id),
  field VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  documents JSONB NOT NULL,
  expected_value TEXT,
  recommended_action VARCHAR(30),
  reasoning TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  resolved_value TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Success Criteria

1. **Adapter Decoupling**: Can swap Nutrient for another PDF processor by implementing a new adapter without changing the FixEngine or UI code

2. **Dual Location Resilience**: Corrections succeed even when PDF layout shifts, using search_text fallback

3. **Full Annotation Support**: All 5 annotation types (highlight, comment, flag, strikethrough, underline) work in the UI

4. **Cross-Document Validation**: System detects and flags inconsistencies across claim documents

5. **Canonical Schema**: Correction payloads follow Claims IQ's own standard, not Nutrient-specific format

6. **Audit Completeness**: Every correction includes evidence, reasoning, and full before/after tracking

---

## Open Questions

1. **AI Integration**: How will the AI analysis engine generate correction payloads? Direct API or async queue?

2. **Real-time Collaboration**: Should multiple adjusters be able to review the same claim simultaneously?

3. **Fraud Detection**: Should escalation automatically trigger fraud investigation workflows?

4. **Document Versioning**: How do we handle corrections when a document is replaced with a newer version?

---

## Appendix: File Manifest

| File | Purpose |
|------|---------|
| `shared/schemas/correction.schema.ts` | Canonical correction format |
| `shared/schemas/annotation.schema.ts` | Annotation schema |
| `shared/schemas/cross-document-validation.schema.ts` | Cross-doc validation |
| `shared/schemas/correction-payload.schema.ts` | Full bundle schema |
| `client/src/lib/adapters/pdf-processor.interface.ts` | Adapter interface |
| `client/src/lib/adapters/nutrient.adapter.ts` | Nutrient implementation |
| `client/src/lib/adapters/adapter-factory.ts` | Factory pattern |
| `client/src/lib/location-resolver.ts` | Dual location strategy |
| `client/src/lib/fix-engine.ts` | Updated fix engine |
| `server/services/cross-document-validator.ts` | Validation engine |
| `server/services/field-extractor.ts` | Field extraction |
| `supabase/migrations/002_canonical_schema.sql` | Database migration |
