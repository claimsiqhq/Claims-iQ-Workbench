# CHANGES_001: Phase 6 Implementation Plan

## Claims IQ Core — Completing the Architecture Integration

This document outlines the remaining work to fully integrate the Claims IQ Core architecture into the workbench application. Phases 1-5 (canonical schemas, adapter layer, cross-document validation, dual location strategy, and fix engine refactoring) are complete. This plan covers Phase 6: UI integration, database persistence, API endpoints, and testing.

---

## Executive Summary

| Category | Items | Effort Estimate |
|----------|-------|-----------------|
| UI Integration | 4 components | 2-3 days |
| Database Migration | 3 tables + storage updates | 1 day |
| API Endpoints | 5 new/updated endpoints | 1-2 days |
| Testing | Unit + integration tests | 1-2 days |
| **Total** | | **5-8 days** |

---

## Part 1: UI Integration

### 1.1 Integrate Annotation Panel into Workbench

**File**: `client/src/pages/workbench.tsx`

**Current State**: `annotation-panel.tsx` component exists but is not wired into the workbench.

**Changes Required**:

```tsx
// Add to workbench imports
import { AnnotationPanel } from "@/components/annotation-panel";
import { PDFAdapterFactory } from "@/lib/adapters";
import type { Annotation } from "@shared/schemas";

// Add state for annotations
const [annotations, setAnnotations] = useState<Annotation[]>([]);
const [showAnnotationPanel, setShowAnnotationPanel] = useState(false);
const [pdfAdapter, setPdfAdapter] = useState<PDFProcessorAdapter | null>(null);

// Initialize adapter when viewer loads
useEffect(() => {
  if (viewerInstance) {
    PDFAdapterFactory.create("nutrient", viewerInstance)
      .then(adapter => setPdfAdapter(adapter));
  }
}, [viewerInstance]);

// Add annotation panel to layout (right sidebar)
{showAnnotationPanel && pdfAdapter && (
  <AnnotationPanel
    adapter={pdfAdapter}
    documentId={selectedDocumentId}
    currentPage={currentPage}
    onAnnotationCreated={(ann) => setAnnotations(prev => [...prev, ann])}
    onAnnotationDeleted={(id) => setAnnotations(prev => prev.filter(a => a.id !== id))}
  />
)}
```

**UI Changes**:
- Add "Annotations" toggle button to toolbar
- Show annotation count badge
- Panel slides in from right side
- Supports all 5 annotation types (highlight, comment, flag, strikethrough, underline)

---

### 1.2 Integrate Cross-Document Validation Panel

**File**: `client/src/pages/workbench.tsx`

**Current State**: `cross-document-validation-panel.tsx` component exists but is not connected.

**Changes Required**:

```tsx
// Add imports
import { CrossDocumentValidationPanel } from "@/components/cross-document-validation-panel";
import type { CrossDocumentValidation } from "@shared/schemas";

// Add state
const [crossDocValidations, setCrossDocValidations] = useState<CrossDocumentValidation[]>([]);
const [showValidationPanel, setShowValidationPanel] = useState(false);

// Fetch validations when claim is selected
useEffect(() => {
  if (selectedClaimId) {
    api.getCrossDocumentValidations(selectedClaimId)
      .then(validations => setCrossDocValidations(validations));
  }
}, [selectedClaimId]);

// Add to layout (modal or side panel)
{showValidationPanel && (
  <CrossDocumentValidationPanel
    claimId={selectedClaimId}
    validations={crossDocValidations}
    onResolve={async (validationId, resolvedValue) => {
      await api.resolveCrossDocValidation(validationId, resolvedValue);
      // Refresh validations
    }}
    onEscalate={async (validationId, reason) => {
      await api.escalateCrossDocValidation(validationId, reason);
    }}
  />
)}
```

**UI Changes**:
- Add "Cross-Doc Issues" button to header (shows count badge if issues exist)
- Panel shows side-by-side comparison of conflicting values
- One-click resolution: select correct value and apply to all documents
- Escalation workflow for fraud/suspicious discrepancies

---

### 1.3 Enhanced Issue Card with Correction Type

**File**: `client/src/pages/workbench.tsx` (issue card section)

**Changes Required**:

Update issue cards to display:
- Correction type icon and label (typo, date_error, phone_format, etc.)
- Dual location indicator (shows if search_text fallback is available)
- Evidence source (where the correct value was found)
- Recommended action badge (auto_correct, flag_for_review, escalate)

```tsx
// Add correction type badge
const getCorrectionTypeIcon = (type: string) => {
  const icons: Record<string, LucideIcon> = {
    typo: Type,
    date_error: Calendar,
    phone_format: Phone,
    name_mismatch: User,
    address_error: MapPin,
    numeric_error: Hash,
    missing_value: AlertCircle,
    format_standardization: FileText,
    data_inconsistency: AlertTriangle,
  };
  return icons[type] || AlertCircle;
};

// In issue card render
<Badge variant="outline" className="text-xs">
  <CorrectionTypeIcon className="h-3 w-3 mr-1" />
  {formatCorrectionType(issue.type)}
</Badge>

{issue.location?.search_text && (
  <Tooltip content="Has text fallback location">
    <Search className="h-3 w-3 text-muted-foreground" />
  </Tooltip>
)}
```

---

### 1.4 Wire FixEngine to Use Adapter Pattern

**File**: `client/src/pages/workbench.tsx`

**Current State**: Workbench may still use old direct Nutrient calls.

**Changes Required**:

```tsx
// Replace direct Nutrient calls with adapter pattern
import { FixEngine } from "@/lib/fix-engine";
import { PDFAdapterFactory } from "@/lib/adapters";

// Create fix engine when adapter is ready
const [fixEngine, setFixEngine] = useState<FixEngine | null>(null);

useEffect(() => {
  if (pdfAdapter && viewerInstance) {
    setFixEngine(new FixEngine(pdfAdapter, viewerInstance));
  }
}, [pdfAdapter, viewerInstance]);

// Update handleApplyFix to use new engine
const handleApplyFix = async (issue: Issue) => {
  if (!fixEngine) return;
  
  // Legacy method still works
  const result = await fixEngine.applyFix(issue);
  
  if (result.success) {
    // Update UI, log audit
    await api.logAudit({
      claimId: selectedClaimId,
      documentId: selectedDocumentId,
      issueId: issue.issueId,
      action: "applied",
      method: result.method,
      beforeValue: issue.foundValue,
      afterValue: issue.expectedValue,
    });
  }
};
```

---

## Part 2: Database Migration

### 2.1 Create Migration SQL

**File**: `supabase/migrations/002_canonical_schema.sql`

```sql
-- ============================================
-- Claims IQ Core Canonical Schema Migration
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------
-- Corrections Table
-- Stores canonical corrections per document
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  
  -- Correction details
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'typo', 'date_error', 'phone_format', 'name_mismatch',
    'address_error', 'numeric_error', 'missing_value',
    'format_standardization', 'data_inconsistency'
  )),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  
  -- Location (dual strategy)
  location JSONB NOT NULL,
  
  -- Values
  found_value TEXT NOT NULL,
  expected_value TEXT NOT NULL,
  
  -- Confidence & Review
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  requires_human_review BOOLEAN DEFAULT true,
  recommended_action VARCHAR(30) CHECK (recommended_action IN (
    'auto_correct', 'flag_for_review', 'escalate', 'informational'
  )),
  
  -- Evidence
  evidence JSONB,
  
  -- Form field hint
  form_field_name VARCHAR(255),
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'manual')),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES auth.users(id),
  applied_method VARCHAR(50),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key to documents
  CONSTRAINT fk_document FOREIGN KEY (document_id) 
    REFERENCES documents(document_id) ON DELETE CASCADE
);

-- Index for common queries
CREATE INDEX idx_corrections_document ON corrections(document_id);
CREATE INDEX idx_corrections_claim ON corrections(claim_id);
CREATE INDEX idx_corrections_status ON corrections(status);

-- --------------------------------------------
-- Annotations Table
-- Stores visual annotations on documents
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id TEXT NOT NULL,
  
  -- Annotation type
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'highlight', 'comment', 'flag', 'strikethrough', 'underline'
  )),
  
  -- Location
  location JSONB NOT NULL,
  
  -- Content
  text TEXT,
  color VARCHAR(7), -- Hex color
  
  -- Linkage
  related_correction_id UUID REFERENCES corrections(id) ON DELETE SET NULL,
  related_validation_id UUID,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_annotation_document FOREIGN KEY (document_id)
    REFERENCES documents(document_id) ON DELETE CASCADE
);

-- Index
CREATE INDEX idx_annotations_document ON annotations(document_id);
CREATE INDEX idx_annotations_type ON annotations(type);

-- --------------------------------------------
-- Cross-Document Validations Table
-- Stores inconsistencies across claim documents
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS cross_document_validations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id TEXT NOT NULL,
  
  -- Validated field
  field VARCHAR(50) NOT NULL CHECK (field IN (
    'claim_number', 'policy_number', 'insured_name', 'insured_phone',
    'insured_email', 'date_of_loss', 'property_address', 'loss_amount',
    'payment_amount', 'adjuster_name', 'adjuster_phone', 'coverage_type',
    'deductible'
  )),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  
  -- Document references (JSON array)
  documents JSONB NOT NULL,
  
  -- Resolution
  expected_value TEXT,
  recommended_action VARCHAR(30) CHECK (recommended_action IN (
    'auto_correct', 'flag_for_review', 'escalate', 'informational'
  )),
  reasoning TEXT,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored', 'escalated')),
  resolved_value TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  escalation_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_validation_claim FOREIGN KEY (claim_id)
    REFERENCES claims(claim_id) ON DELETE CASCADE
);

-- Index
CREATE INDEX idx_validations_claim ON cross_document_validations(claim_id);
CREATE INDEX idx_validations_status ON cross_document_validations(status);
CREATE INDEX idx_validations_severity ON cross_document_validations(severity);

-- --------------------------------------------
-- Row Level Security Policies
-- --------------------------------------------

-- Enable RLS on new tables
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_document_validations ENABLE ROW LEVEL SECURITY;

-- Corrections policies
CREATE POLICY corrections_select ON corrections
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY corrections_insert ON corrections
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY corrections_update ON corrections
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Annotations policies  
CREATE POLICY annotations_select ON annotations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY annotations_insert ON annotations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY annotations_update ON annotations
  FOR UPDATE USING (created_by = auth.uid() OR auth.uid() IS NOT NULL);

CREATE POLICY annotations_delete ON annotations
  FOR DELETE USING (created_by = auth.uid() OR auth.uid() IS NOT NULL);

-- Cross-document validations policies
CREATE POLICY validations_select ON cross_document_validations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY validations_insert ON cross_document_validations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY validations_update ON cross_document_validations
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- --------------------------------------------
-- Triggers for updated_at
-- --------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corrections_updated_at
  BEFORE UPDATE ON corrections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER validations_updated_at
  BEFORE UPDATE ON cross_document_validations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

### 2.2 Update Storage Layer

**File**: `server/storage.ts`

Add new methods to the storage interface:

```typescript
interface IStorage {
  // Existing methods...
  
  // Corrections
  getCorrections(documentId: string): Promise<Correction[]>;
  getCorrectionsByClaimId(claimId: string): Promise<Correction[]>;
  createCorrection(correction: Correction): Promise<Correction>;
  updateCorrectionStatus(id: string, status: string, appliedBy?: string, method?: string): Promise<void>;
  
  // Annotations
  getAnnotations(documentId: string): Promise<Annotation[]>;
  createAnnotation(annotation: Annotation): Promise<Annotation>;
  updateAnnotation(id: string, updates: Partial<Annotation>): Promise<Annotation>;
  deleteAnnotation(id: string): Promise<void>;
  
  // Cross-Document Validations
  getCrossDocValidations(claimId: string): Promise<CrossDocumentValidation[]>;
  createCrossDocValidation(validation: CrossDocumentValidation): Promise<CrossDocumentValidation>;
  resolveCrossDocValidation(id: string, resolvedValue: string, resolvedBy: string): Promise<void>;
  escalateCrossDocValidation(id: string, reason: string): Promise<void>;
}
```

**Implementation** (Supabase version):

```typescript
// Corrections
async getCorrections(documentId: string): Promise<Correction[]> {
  const { data, error } = await supabase
    .from('corrections')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

async createCorrection(correction: Correction): Promise<Correction> {
  const { data, error } = await supabase
    .from('corrections')
    .insert(correction)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async updateCorrectionStatus(
  id: string, 
  status: string, 
  appliedBy?: string, 
  method?: string
): Promise<void> {
  const { error } = await supabase
    .from('corrections')
    .update({
      status,
      applied_by: appliedBy,
      applied_method: method,
      applied_at: status === 'applied' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  
  if (error) throw error;
}

// Similar implementations for annotations and cross-doc validations...
```

---

## Part 3: API Endpoints

### 3.1 New Endpoints

**File**: `server/routes.ts`

```typescript
// ============================================
// Corrections Endpoints
// ============================================

// GET /api/documents/:documentId/corrections
app.get("/api/documents/:documentId/corrections", async (req, res) => {
  try {
    const { documentId } = req.params;
    const corrections = await storage.getCorrections(documentId);
    res.json(corrections);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch corrections" });
  }
});

// POST /api/documents/:documentId/corrections
app.post("/api/documents/:documentId/corrections", async (req, res) => {
  try {
    const { documentId } = req.params;
    const correction = CorrectionSchema.parse({
      ...req.body,
      document_id: documentId,
    });
    const created = await storage.createCorrection(correction);
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ error: "Invalid correction data" });
  }
});

// PATCH /api/corrections/:id/status
app.patch("/api/corrections/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, method } = req.body;
    const userId = req.user?.id; // From auth middleware
    await storage.updateCorrectionStatus(id, status, userId, method);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update correction" });
  }
});

// ============================================
// Annotations Endpoints
// ============================================

// GET /api/documents/:documentId/annotations
app.get("/api/documents/:documentId/annotations", async (req, res) => {
  try {
    const { documentId } = req.params;
    const annotations = await storage.getAnnotations(documentId);
    res.json(annotations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch annotations" });
  }
});

// POST /api/documents/:documentId/annotations
app.post("/api/documents/:documentId/annotations", async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user?.id;
    const annotation = AnnotationSchema.parse({
      ...req.body,
      document_id: documentId,
      created_by: userId,
      created_at: new Date().toISOString(),
    });
    const created = await storage.createAnnotation(annotation);
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ error: "Invalid annotation data" });
  }
});

// DELETE /api/annotations/:id
app.delete("/api/annotations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await storage.deleteAnnotation(id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete annotation" });
  }
});

// ============================================
// Cross-Document Validation Endpoints
// ============================================

// GET /api/claims/:claimId/validations
app.get("/api/claims/:claimId/validations", async (req, res) => {
  try {
    const { claimId } = req.params;
    const validations = await storage.getCrossDocValidations(claimId);
    res.json(validations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch validations" });
  }
});

// POST /api/claims/:claimId/validate
// Triggers cross-document validation for a claim
app.post("/api/claims/:claimId/validate", async (req, res) => {
  try {
    const { claimId } = req.params;
    
    // Get all documents for the claim
    const documents = await storage.getDocuments(claimId);
    
    // Extract fields from each document
    const extractor = new FieldExtractor();
    const extractedDocs = await Promise.all(
      documents.map(async (doc) => ({
        document_id: doc.documentId,
        document_name: doc.name,
        fields: await extractor.extractFromDocument(doc.documentId, doc.content),
      }))
    );
    
    // Run validation
    const validator = new CrossDocumentValidator();
    const validations = await validator.validateClaim(claimId, extractedDocs);
    
    // Store validations
    for (const validation of validations) {
      await storage.createCrossDocValidation({
        ...validation,
        claim_id: claimId,
      });
    }
    
    res.json({ validations, count: validations.length });
  } catch (error) {
    res.status(500).json({ error: "Validation failed" });
  }
});

// POST /api/validations/:id/resolve
app.post("/api/validations/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const { resolved_value } = req.body;
    const userId = req.user?.id;
    
    await storage.resolveCrossDocValidation(id, resolved_value, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to resolve validation" });
  }
});

// POST /api/validations/:id/escalate
app.post("/api/validations/:id/escalate", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    await storage.escalateCrossDocValidation(id, reason);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to escalate validation" });
  }
});

// ============================================
// Correction Payload Ingestion (for AI Engine)
// ============================================

// POST /api/claims/:claimId/correction-payload
// Accepts canonical correction payload from AI analysis engine
app.post("/api/claims/:claimId/correction-payload", async (req, res) => {
  try {
    const { claimId } = req.params;
    const payload = DocumentCorrectionPayloadSchema.parse(req.body);
    
    // Validate claim ID matches
    if (payload.claim.claim_id !== claimId) {
      return res.status(400).json({ error: "Claim ID mismatch" });
    }
    
    // Store all corrections
    for (const doc of payload.documents) {
      for (const correction of doc.corrections) {
        await storage.createCorrection({
          ...correction,
          document_id: doc.document_id,
          claim_id: claimId,
        });
      }
      
      // Store annotations
      for (const annotation of doc.annotations) {
        await storage.createAnnotation({
          ...annotation,
          document_id: doc.document_id,
        });
      }
    }
    
    // Store cross-document validations
    for (const validation of payload.cross_document_validations) {
      await storage.createCrossDocValidation({
        ...validation,
        claim_id: claimId,
      });
    }
    
    res.status(201).json({
      success: true,
      summary: payload.summary,
    });
  } catch (error) {
    res.status(400).json({ error: "Invalid correction payload" });
  }
});
```

---

### 3.2 Update API Client

**File**: `client/src/lib/api.ts`

```typescript
// Add new API methods

// Corrections
getCorrections: async (documentId: string): Promise<Correction[]> => {
  const response = await fetch(`/api/documents/${documentId}/corrections`);
  return response.json();
},

updateCorrectionStatus: async (
  correctionId: string, 
  status: string, 
  method?: string
): Promise<void> => {
  await fetch(`/api/corrections/${correctionId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, method }),
  });
},

// Annotations
getAnnotations: async (documentId: string): Promise<Annotation[]> => {
  const response = await fetch(`/api/documents/${documentId}/annotations`);
  return response.json();
},

createAnnotation: async (documentId: string, annotation: Omit<Annotation, 'id'>): Promise<Annotation> => {
  const response = await fetch(`/api/documents/${documentId}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(annotation),
  });
  return response.json();
},

deleteAnnotation: async (annotationId: string): Promise<void> => {
  await fetch(`/api/annotations/${annotationId}`, { method: 'DELETE' });
},

// Cross-Document Validations
getCrossDocumentValidations: async (claimId: string): Promise<CrossDocumentValidation[]> => {
  const response = await fetch(`/api/claims/${claimId}/validations`);
  return response.json();
},

triggerCrossDocValidation: async (claimId: string): Promise<{ validations: CrossDocumentValidation[], count: number }> => {
  const response = await fetch(`/api/claims/${claimId}/validate`, { method: 'POST' });
  return response.json();
},

resolveCrossDocValidation: async (validationId: string, resolvedValue: string): Promise<void> => {
  await fetch(`/api/validations/${validationId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolved_value: resolvedValue }),
  });
},

escalateCrossDocValidation: async (validationId: string, reason: string): Promise<void> => {
  await fetch(`/api/validations/${validationId}/escalate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
},
```

---

## Part 4: Testing

### 4.1 Unit Tests for Schemas

**File**: `tests/schemas.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { 
  CorrectionSchema, 
  AnnotationSchema, 
  CrossDocumentValidationSchema,
  DocumentCorrectionPayloadSchema 
} from '@shared/schemas';

describe('CorrectionSchema', () => {
  it('validates a complete correction', () => {
    const correction = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'date_error',
      severity: 'warning',
      location: {
        bbox: { pageIndex: 0, left: 100, top: 200, width: 50, height: 20 },
        search_text: { text: '01/15/2023', occurrence: 1 },
      },
      found_value: '01/15/2023',
      expected_value: '01/15/2024',
      confidence: 0.95,
      requires_human_review: false,
      recommended_action: 'auto_correct',
      evidence: { reasoning: 'Year mismatch detected' },
      status: 'pending',
    };
    
    expect(() => CorrectionSchema.parse(correction)).not.toThrow();
  });
  
  it('requires at least bbox or search_text in location', () => {
    const invalidCorrection = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'typo',
      severity: 'info',
      location: {}, // Neither bbox nor search_text
      found_value: 'test',
      expected_value: 'Test',
      confidence: 0.8,
      requires_human_review: true,
      recommended_action: 'flag_for_review',
      evidence: { reasoning: 'test' },
    };
    
    expect(() => CorrectionSchema.parse(invalidCorrection)).toThrow();
  });
});

describe('AnnotationSchema', () => {
  it('validates all annotation types', () => {
    const types = ['highlight', 'comment', 'flag', 'strikethrough', 'underline'];
    
    for (const type of types) {
      const annotation = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type,
        location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } },
        created_by: 'user-123',
        created_at: new Date().toISOString(),
      };
      
      expect(() => AnnotationSchema.parse(annotation)).not.toThrow();
    }
  });
});
```

---

### 4.2 Unit Tests for Adapters

**File**: `tests/adapters.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { NutrientAdapter } from '@/lib/adapters/nutrient.adapter';

describe('NutrientAdapter', () => {
  it('selects form_field strategy for corrections with form_field_name', () => {
    const adapter = new NutrientAdapter();
    
    const correction = {
      id: 'test',
      type: 'typo' as const,
      form_field_name: 'claimNumber',
      // ... other fields
    };
    
    // Access private method via any cast for testing
    const strategies = (adapter as any).getStrategiesForCorrection(correction);
    expect(strategies[0]).toBe('form_field');
  });
  
  it('selects content_edit first for date errors', () => {
    const adapter = new NutrientAdapter();
    
    const correction = {
      id: 'test',
      type: 'date_error' as const,
      // ... other fields
    };
    
    const strategies = (adapter as any).getStrategiesForCorrection(correction);
    expect(strategies[0]).toBe('content_edit');
    expect(strategies[1]).toBe('redaction_overlay');
  });
});
```

---

### 4.3 Unit Tests for LocationResolver

**File**: `tests/location-resolver.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { LocationResolver } from '@/lib/location-resolver';

describe('LocationResolver', () => {
  it('returns bbox directly when valid', async () => {
    const mockInstance = {
      getTextAtLocation: vi.fn().mockResolvedValue('some text'),
    };
    
    const resolver = new LocationResolver(mockInstance);
    
    const location = {
      bbox: { pageIndex: 0, left: 100, top: 200, width: 50, height: 20 },
    };
    
    const result = await resolver.resolveLocation(location);
    
    expect(result).toEqual({
      type: 'bbox',
      bbox: location.bbox,
    });
  });
  
  it('falls back to search_text when bbox is missing', async () => {
    const mockInstance = {
      search: vi.fn().mockResolvedValue([
        { pageIndex: 0, rect: { left: 50, top: 100, width: 30, height: 15 } },
      ]),
    };
    
    const resolver = new LocationResolver(mockInstance);
    
    const location = {
      search_text: { text: 'test value', occurrence: 1 },
    };
    
    const result = await resolver.resolveLocation(location);
    
    expect(result?.type).toBe('search_text');
    expect(result?.bbox.pageIndex).toBe(0);
  });
});
```

---

### 4.4 Integration Tests for Cross-Document Validation

**File**: `tests/cross-document-validation.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { FieldExtractor } from '@/server/services/field-extractor';
import { CrossDocumentValidator } from '@/server/services/cross-document-validator';

describe('CrossDocumentValidator', () => {
  it('detects claim number inconsistency', async () => {
    const validator = new CrossDocumentValidator();
    
    const documents = [
      {
        document_id: 'doc1',
        document_name: 'FNOL Form',
        fields: {
          claim_number: { value: 'CLM-001', confidence: 0.95, location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } } },
        },
      },
      {
        document_id: 'doc2',
        document_name: 'Invoice',
        fields: {
          claim_number: { value: 'CLM-002', confidence: 0.90, location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } } },
        },
      },
    ];
    
    const validations = await validator.validateClaim('claim-123', documents);
    
    expect(validations.length).toBe(1);
    expect(validations[0].field).toBe('claim_number');
    expect(validations[0].severity).toBe('critical');
    expect(validations[0].recommended_action).toBe('escalate'); // Critical field
  });
  
  it('returns no validations when all values match', async () => {
    const validator = new CrossDocumentValidator();
    
    const documents = [
      {
        document_id: 'doc1',
        document_name: 'FNOL Form',
        fields: {
          claim_number: { value: 'CLM-001', confidence: 0.95, location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } } },
        },
      },
      {
        document_id: 'doc2',
        document_name: 'Invoice',
        fields: {
          claim_number: { value: 'CLM-001', confidence: 0.90, location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } } },
        },
      },
    ];
    
    const validations = await validator.validateClaim('claim-123', documents);
    
    expect(validations.length).toBe(0);
  });
});
```

---

## Part 5: Implementation Checklist

### Phase 6A: UI Integration (2-3 days)

- [ ] Import and wire annotation panel into workbench
- [ ] Import and wire cross-document validation panel
- [ ] Add toolbar buttons for panels (Annotations, Cross-Doc Issues)
- [ ] Update issue cards with correction type badges
- [ ] Initialize PDFAdapterFactory in workbench
- [ ] Replace direct FixEngine calls with adapter-based version
- [ ] Add count badges for annotations and validation issues
- [ ] Test annotation creation/deletion flow
- [ ] Test cross-doc validation display and resolution

### Phase 6B: Database Migration (1 day)

- [ ] Run migration SQL in Supabase SQL Editor
- [ ] Verify tables created with correct constraints
- [ ] Test RLS policies
- [ ] Update storage.ts with new methods (Supabase implementation)
- [ ] Test storage methods with sample data

### Phase 6C: API Endpoints (1-2 days)

- [ ] Add corrections endpoints (GET, POST, PATCH status)
- [ ] Add annotations endpoints (GET, POST, DELETE)
- [ ] Add cross-doc validation endpoints (GET, POST validate, POST resolve, POST escalate)
- [ ] Add correction payload ingestion endpoint
- [ ] Update api.ts client with new methods
- [ ] Test all endpoints with curl/Postman
- [ ] Add error handling and validation

### Phase 6D: Testing (1-2 days)

- [ ] Write schema validation tests
- [ ] Write adapter unit tests
- [ ] Write LocationResolver tests
- [ ] Write CrossDocumentValidator integration tests
- [ ] Run full test suite
- [ ] Manual E2E testing of complete flow

---

## Appendix: API Reference

### Corrections

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents/:docId/corrections` | Get all corrections for a document |
| POST | `/api/documents/:docId/corrections` | Create a correction |
| PATCH | `/api/corrections/:id/status` | Update correction status |

### Annotations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents/:docId/annotations` | Get all annotations for a document |
| POST | `/api/documents/:docId/annotations` | Create an annotation |
| DELETE | `/api/annotations/:id` | Delete an annotation |

### Cross-Document Validations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/claims/:claimId/validations` | Get all validations for a claim |
| POST | `/api/claims/:claimId/validate` | Trigger validation |
| POST | `/api/validations/:id/resolve` | Resolve a validation |
| POST | `/api/validations/:id/escalate` | Escalate a validation |

### Payload Ingestion

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/claims/:claimId/correction-payload` | Ingest AI correction payload |

---

*Plan created: February 5, 2026*
