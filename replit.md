# Claims IQ Workbench

## Overview
Claims IQ Workbench is a human-in-the-loop document processing application for reviewing and correcting issues within PDF insurance claim documents. Users upload PDF claim files (optionally with correction payloads), and OpenAI's vision AI extracts structured data. The workbench highlights detected issues as annotations and provides workflows for applying, manually editing, or rejecting corrections. All actions are audit-logged for compliance.

## User Preferences
- Preferred communication style: Simple, everyday language
- Prefers manual testing over automated testing subagent
- Documents should auto-load after upload (no manual "Load" step)

## Tech Stack
- Frontend: React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui, TanStack Query v5, Wouter
- PDF Viewer: Nutrient Web SDK (`@nutrient-sdk/viewer`) Viewer edition
- Backend: Node.js, Express 5
- Database: Supabase PostgreSQL with RLS
- File Storage: Supabase Storage (primary), local filesystem (fallback)
- Auth: Supabase Auth
- AI/OCR: OpenAI gpt-4o vision via Replit AI Integrations
- Validation: Zod, AJV
- PDF-to-Image: pdftoppm

## Design Patterns
- Adapter Pattern: `PDFProcessorAdapter` interface in `client/src/lib/adapters/pdf-processor.interface.ts`
- Fix Engine: Cascading correction strategies (form field -> content edit -> redaction overlay)
- Dual Location: BBox coordinates (primary) + search-text matching (fallback)
- Canonical Schemas: Zod schemas in `shared/schemas/` shared across frontend/backend
- Repository Pattern: `server/storage.ts` abstracts all database operations
- Non-destructive: Original PDFs preserved; changes tracked as separate records
- Audit Logging: All actions logged with before/after states for compliance

## Nutrient Web SDK Integration

### Edition Constraints
Using Viewer edition (`@nutrient-sdk/viewer`). This is read-only.

CAN do: Render PDFs, create/update/delete annotations, text search (`instance.search()`), navigate (`instance.jumpToRect()`), export/apply InstantJSON, read form fields.

CANNOT do: `instance.beginContentEditingSession()`, `instance.createRedactionOverlay()`, `instance.applyRedactions()`, direct PDF text replacement. These require Editor or Full edition.

### Viewer Lifecycle Hook
File: `client/src/hooks/use-nutrient-viewer.ts`

```
import NutrientViewer from "@nutrient-sdk/viewer";
const viewerInstance = await NutrientViewer.load({
  container: HTMLElement,
  document: "url-to-pdf",   // OR instant: { serverUrl, documentId, jwt }
  useCDN: true,
});
```

Returns: `instance` (viewer instance), `isLoading`, `error`, `containerRef`, `NutrientViewer` (raw module).
Cleanup: calls `instance.unload()` on unmount or document change.

### SDK API Calls Used

1. `instance.search(text)` - Text search. Returns `Immutable.List` of `SearchResult`. Each has `.pageIndex` and `.rectsOnPage` (also `Immutable.List<Rect>`). Use `.size` not `.length`, `.get(i)` not `[i]`.

2. `instance.jumpToRect(pageIndex, rect)` - Scroll PDF to a location.

3. `instance.create(annotation)` - Create annotation. Returns created annotation with `.id`.
   - `new NutrientViewer.Annotations.HighlightAnnotation({ pageIndex, rects: new Immutable.List([rect]), color })`
   - `new NutrientViewer.Annotations.RectangleAnnotation({ pageIndex, boundingBox: rect, strokeColor, fillColor })`
   - `new NutrientViewer.Annotations.TextAnnotation({ pageIndex, boundingBox: rect, text: { value: "..." } })`
   - `new NutrientViewer.Annotations.StrikeOutAnnotation({ pageIndex, rects: Immutable.List })`
   - `new NutrientViewer.Annotations.UnderlineAnnotation({ pageIndex, rects: Immutable.List })`
   - `new NutrientViewer.Annotations.StampAnnotation({ pageIndex, boundingBox: rect, stampType: "Approved" })`

4. `instance.delete(annotationId)` - Remove annotation.

5. `instance.exportInstantJSON()` / `instance.applyInstantJSON(json)` - Save/restore annotation state.

6. `instance.getFormFields()` / `instance.setFormFieldValues([{ name, value }])` - Form field operations.

### Critical Gotchas
- `rects` parameter for HighlightAnnotation, StrikeOutAnnotation, UnderlineAnnotation MUST be `new NutrientViewer.Immutable.List([...])`, NOT a plain array. Plain arrays silently fail.
- `instance.search()` returns `Immutable.List`. Use `.size` and `.get(i)`, not `.length` and `[i]`.
- `NutrientViewer.Color({ r, g, b })` takes values 0-255.
- Module namespaces are on the NutrientViewer module, not the instance: `NutrientViewer.Annotations`, `NutrientViewer.Geometry`, `NutrientViewer.Color`, `NutrientViewer.Immutable`.

### Adapter Architecture

Interface: `client/src/lib/adapters/pdf-processor.interface.ts`
- `initialize(instance, module?)`, `dispose()`
- `applyTextCorrection(correction)` -> `CorrectionResult { success, method, error? }`
- `createAnnotation(annotation)`, `updateAnnotation(id, partial)`, `deleteAnnotation(id)`, `getAnnotations(pageIndex?)`
- `getFormFields()`, `setFormFieldValue(name, value)`
- `supportsContentEditing()`, `editTextContent(pageIndex, textBlockId, newText)`
- `createRedactionOverlay(location, overlayText)`
- `exportDocument(format)`, `getInstantJSON()`

Implementation: `client/src/lib/adapters/nutrient.adapter.ts` (NutrientAdapter)
- Loads Annotations, Geometry, Color, Immutable modules on initialize() with retry logic (20 retries, 200ms each)
- Maps canonical types to Nutrient constructors: highlight->HighlightAnnotation (fallback RectangleAnnotation), comment->TextAnnotation, strikethrough->StrikeOutAnnotation, underline->UnderlineAnnotation, flag->StampAnnotation
- Correction strategies tried in order: form_field, content_edit (fails on Viewer), redaction_overlay (fails on Viewer)

Factory: `client/src/lib/adapters/adapter-factory.ts`
```
const adapter = await PDFAdapterFactory.create("nutrient", instance, NutrientViewer);
```

### Location Resolution
File: `client/src/lib/location-resolver.ts`

Dual strategy:
1. BBox: Precise coordinates, verified by checking text at location
2. search_text: Uses `instance.search(text)`, supports occurrence and context disambiguation

Note: LocationResolver treats search results as plain arrays. Workbench handleIssueClick correctly uses Immutable.List API.

### Fix Engine
File: `client/src/lib/fix-engine.ts`

Orchestrates: LocationResolver -> PDFProcessorAdapter. Supports both canonical `Correction` schema and legacy `Issue` schema via `migrateIssueToCorrection()`.

### Issue Highlighting Flow (workbench.tsx handleIssueClick)
1. Get search text: `issue.searchText || issue.foundValue || issue.expectedValue`
2. `instance.search(text)` -> filter by pageIndex -> get rectsOnPage
3. Create HighlightAnnotation with severity-based color
4. `instance.jumpToRect()` to scroll
5. Store annotation ID in Map for cleanup on re-click

### Correction Workflow (Human-in-the-Loop)
Since Viewer edition cannot edit PDFs:
- Accept: status=APPLIED, audit log with before/after values, no PDF modification
- Manual Edit: status=MANUAL, user uses viewer annotation tools
- Reject: status=REJECTED, logged as false positive
- Reset: status=OPEN, logged

All status changes: update local Map (optimistic), persist via `PATCH /api/issues/:issueId/status`, record in audit log via `POST /api/audit`.

## PDF Processing Pipeline
1. Upload PDF + optional correction JSON
2. Server saves PDF to `data/` directory
3. `pdftoppm` converts pages to PNG (up to 3 pages)
4. PNGs base64-encoded, sent to OpenAI gpt-4o vision API (`server/pdf-parser.ts`)
5. OpenAI extracts: claimId, policyNumber, insuredName, dateOfLoss, claimAmount, adjusterName, status
6. Claim/document records created in Supabase
7. Correction JSON validated against IssueBundleSchema or adapted from DocumentCorrectionPayloadSchema
8. PDF uploaded to Supabase Storage
9. Document auto-loads in workbench

## Data Schemas

### Legacy (`shared/schema.ts`)
- Issue: issueId, type, severity, confidence, pageIndex, rect?, searchText?, foundValue?, expectedValue?, formFieldName?, suggestedFix, label?, status?
- IssueBundle: schemaVersion, claimId, document { documentId, fingerprint }, issues[]
- Claim: claimId, claimNumber?, policyNumber?, status?, insuredName?, dateOfLoss?, claimAmount?, adjusterName?, documents[]
- AuditLog: claimId, documentId, issueId, action, method?, before?, after?, user?, ts?
- IssueStatus: "OPEN" | "APPLIED" | "MANUAL" | "REJECTED"

### Canonical (`shared/schemas/`)
- Location: bbox? { pageIndex, left, top, width, height } + search_text? { text, occurrence, context_before?, context_after? }. At least one required.
- Correction: id(uuid), claim_id, document_id?, type(CorrectionType), severity, location, found_value, expected_value, confidence, requires_human_review, recommended_action, evidence { reasoning }, form_field_name?, status
- CorrectionType: typo, date_error, phone_format, name_mismatch, address_error, numeric_error, missing_value, format_standardization, data_inconsistency
- Annotation: id(uuid), type(highlight|comment|flag|strikethrough|underline), location, text?, color?, created_by, created_at
- CrossDocumentValidation: Validates consistency across multiple claim documents
- DocumentCorrectionPayload: Batch wrapper for multiple documents

## Database Tables
claims, documents, issues, corrections, annotations, audit_logs, correction_schemas, cross_document_validations

Audit log action mapping (app -> DB): applied->AUTO_FIX, manual_edit->MANUAL_FIX, rejected->REJECT, reset->AUTO_FIX

Issue status persistence: PATCH /api/issues/:issueId/status, valid values: OPEN, APPLIED, MANUAL, REJECTED

## API Routes (all require Supabase auth except noted)
- GET /api/health (no auth)
- GET/POST /api/claims, GET /api/claims/:claimId
- GET/POST /api/claims/:claimId/documents
- POST /api/documents/upload
- GET /api/documents/:documentId/issues
- PATCH /api/issues/:issueId/status
- POST /api/audit, GET /api/audit/:claimId
- POST /api/documents/:documentId/corrections
- GET /api/corrections/claim/:claimId
- POST /api/annotations, GET /api/annotations/document/:documentId
- POST /api/claims/:claimId/validate, GET /api/claims/:claimId/validations
- GET /files/:documentId.pdf (direct file serving)

## Frontend
Pages: Login (/login), Workbench (/), Profile (/profile), Settings (/settings)
Workbench: Top bar, left panel (issues), center (PDF viewer), right panel (annotations/validation)
State: TanStack Query for server state, useState for UI, Map<issueId, status> for issue statuses, Map<issueId, annotationId> for annotation tracking

## Key Files
```
client/src/pages/workbench.tsx           - Main workbench UI
client/src/hooks/use-nutrient-viewer.ts  - Nutrient SDK hook
client/src/lib/api.ts                    - API client
client/src/lib/fix-engine.ts             - Correction engine
client/src/lib/location-resolver.ts      - Dual location strategy
client/src/lib/adapters/
  pdf-processor.interface.ts             - Abstract adapter interface
  nutrient.adapter.ts                    - Nutrient implementation
  adapter-factory.ts                     - Adapter factory
server/routes.ts                         - API routes
server/storage.ts                        - Database layer
server/pdf-parser.ts                     - OpenAI vision parsing
shared/schema.ts                         - Legacy schemas
shared/schemas/                          - Canonical schemas
```

## Known Limitations
- Nutrient Viewer edition cannot edit PDF content. Upgrading to Editor/Full enables beginContentEditingSession() and createRedactionOverlay().
- InstantJSON persistence (exportInstantJSON/applyInstantJSON) not yet wired to database.
- AI-extracted bounding boxes are approximate; text search is the primary location strategy.
- LocationResolver uses plain array API; needs adaptation for Nutrient's Immutable.List returns.
- Correction payload adapter handles both legacy IssueBundle and canonical DocumentCorrectionPayload formats.
