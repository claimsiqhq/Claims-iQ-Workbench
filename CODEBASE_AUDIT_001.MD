# CODEBASE AUDIT 001

**Executive Summary**
- Total issues: 24
- Critical: 4
- High: 3
- Medium: 11
- Low: 6
- Top 3 immediate risks:
  1. Public and authorization-bypassed access to documents and document-engine sessions.
  2. Canonical schema drift between `schema.sql` and migration files causing required columns/constraints to be missing.
  3. Canonical writes inserting empty `document_id`/`claim_id` and missing required `claim_id`, which will fail or create orphaned data under the intended schema.
- Overall production-readiness: **Not production-ready**. Critical security and data integrity failures must be addressed before deployment.

**Codebase Map**
- `server/`: Express API, Supabase integration, middleware, PDF parsing, schema storage.
- `client/`: React UI, state hooks, API client, PDF viewer integration.
- `shared/`: Shared schemas/types between server and client.
- `supabase/`: SQL schema and migrations.
- `tests/`, `server/tests/`: Unit and API tests.

---

## 1. DATA LAYER INTEGRITY

1. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/supabase/schema.sql:185` and `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/supabase/migrations/002_canonical_schema.sql:13`
   **Severity**: Critical
   **Category**: Data Layer Integrity
   **Description**: Canonical tables are defined twice with different schemas. `schema.sql` creates `corrections` without `claim_id` and without foreign keys, while the migration expects `claim_id` and FK constraints. Running `schema.sql` first makes `CREATE TABLE IF NOT EXISTS` in the migration a no-op, leaving missing columns/constraints and causing runtime insert failures or orphaned records.
   **Recommendation**: Consolidate to a single source of truth. Convert `schema.sql` canonical tables into migrations that ALTER existing tables to add missing columns and FKs. Add a verification step at startup to assert column presence (e.g., `claim_id`, FKs).

2. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/storage.ts:763`, `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/storage.ts:884`, `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/storage.ts:1051`
   **Severity**: Critical
   **Category**: Data Layer Integrity
   **Description**: Canonical writes do not populate required identifiers. `saveCorrection` omits `claim_id`; `createAnnotation`/`saveAnnotation` insert `document_id` as an empty string; `createCrossDocValidation`/`saveCrossDocumentValidation` insert `claim_id` as an empty string. Under the intended schema (NOT NULL + FK), these writes will fail or create invalid records if constraints are missing.
   **Recommendation**: Thread `claim_id` and `document_id` through API payloads and storage calls. Update `AnnotationSchema` and `CrossDocumentValidationSchema` to include `document_id`/`claim_id` as required inputs, and ensure routes pass them to storage. Remove the two-step insert/update for annotations.

3. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/shared/schema.ts:34` and `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/supabase/schema.sql:46`
   **Severity**: High
   **Category**: Data Layer Integrity
   **Description**: `IssueSchema.rect` is optional in TypeScript, but `issues.rect` is `NOT NULL` in the database. Any issue without a bbox will fail inserts or require invalid dummy data.
   **Recommendation**: Either make `rect` required in the schema and enforce it at ingestion, or change the DB schema to allow null and add a `search_text` column for fallback location.

4. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/shared/schema.ts:41`
   **Severity**: Medium
   **Category**: Data Layer Integrity
   **Description**: `IssueSchema.searchText` exists for bbox fallback, but the DB schema has no `search_text` column. This loses critical fallback data for re-rendering or re-applying corrections.
   **Recommendation**: Add `search_text` JSONB/TEXT to the `issues` table and persist it in `saveIssues`. Alternatively, make bbox required and remove `searchText` from the schema to avoid a false promise.

5. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/drizzle.config.ts:1`, `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/schema-store.ts:31`
   **Severity**: Medium
   **Category**: Data Layer Integrity
   **Description**: Schema management is inconsistent. Drizzle only models `users`, while the rest of the DB is defined via raw SQL. `schema-store` auto-creates `correction_schemas` at runtime without RLS or indexes.
   **Recommendation**: Move all schema creation to migrations. If Drizzle is not used for core tables, remove Drizzle config or expand it to cover all tables. Remove runtime schema creation in favor of migration-managed tables with explicit RLS and indexes.

6. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/storage.ts:441` and `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/storage.ts:1162`
   **Severity**: Low
   **Category**: Data Layer Integrity
   **Description**: `saveIssues` and `saveCorrectionPayload` upsert records one-by-one. Large payloads will be slow and cause avoidable database round trips.
   **Recommendation**: Batch upserts with array inserts and use `upsert` on a list to reduce round trips. Consider `Promise.all` with controlled concurrency if batching is not possible.

No additional Data Layer Integrity findings beyond the items above.

---

## 2. API SURFACE AUDIT

1. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/swagger.ts:47` and `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/routes.ts:506`
   **Severity**: Medium
   **Category**: API Surface Audit
   **Description**: Swagger documents `GET /claims/{claimId}`, but no route exists. This breaks CRUD completeness and misleads clients.
   **Recommendation**: Implement `GET /api/claims/:claimId` (and consider `PATCH`/`DELETE` if needed) or remove the route from Swagger.

2. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/routes.ts:532`
   **Severity**: Medium
   **Category**: API Surface Audit
   **Description**: Response envelopes are inconsistent. Some endpoints return raw arrays or `{ error: "..." }`, while others use `{ data }`/`{ error: { code, message } }`. This increases client complexity and error handling bugs.
   **Recommendation**: Standardize all routes on `sendSuccess`/`sendError` and update any outliers to return consistent envelopes and error objects.

3. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/routes.ts:1203`
   **Severity**: Medium
   **Category**: API Surface Audit
   **Description**: `PATCH /api/annotations/:annotationId` accepts arbitrary `req.body` without schema validation. Invalid `location` or unexpected fields can be stored.
   **Recommendation**: Validate patch bodies with Zod (e.g., `AnnotationSchema.partial()`), and whitelist allowed fields only.

4. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/routes.ts:506`
   **Severity**: Low
   **Category**: API Surface Audit
   **Description**: CRUD coverage is incomplete for core entities (claims, documents). There are list and upload endpoints, but no update/delete endpoints for operational workflows (e.g., fixing claim metadata, removing documents).
   **Recommendation**: Add `PATCH /api/claims/:claimId`, `DELETE /api/claims/:claimId`, `DELETE /api/documents/:documentId` if required by product or admin workflows.

No additional API Surface findings beyond the items above.

---

## 3. UI ↔ API CONTRACT

1. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/client/src/lib/api.ts:199` and `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/routes.ts:722`
   **Severity**: High
   **Category**: UI ↔ API Contract
   **Description**: `uploadAndParseDocument` resolves the raw JSON response and expects `claimId`/`documentId` at the top level, but the server returns `{ data: { claimId, documentId, ... } }`. This yields `undefined` values in the UI on success.
   **Recommendation**: Unwrap `response.data` on the client or change the server to return the raw object for this endpoint. Prefer consistent envelopes across the API.

2. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/client/src/pages/workbench.tsx:163`
   **Severity**: Medium
   **Category**: UI ↔ API Contract
   **Description**: Query errors for health, claims, documents, issues, and session are not surfaced to the user. Failed API calls are indistinguishable from empty data.
   **Recommendation**: Use `isLoading`/`error` from `useQuery` and render explicit error states or toasts for each query.

3. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/routes.ts:414`
   **Severity**: Low
   **Category**: UI ↔ API Contract
   **Description**: `/api/schema*` and `/api/correction-payload` endpoints are not used by the UI. This increases maintenance surface and creates drift.
   **Recommendation**: Either add UI workflows that use these endpoints or remove them and document any external integrations that require them.

No additional UI ↔ API Contract findings beyond the items above.

---

## 4. FEATURE COMPLETENESS

1. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/client/src/lib/adapters/adapter-factory.ts:17`
   **Severity**: Low
   **Category**: Feature Completeness
   **Description**: `pdfjs` and `custom` adapters throw `"not implemented"` errors. Selecting these paths would crash the workflow.
   **Recommendation**: Either implement these adapters or remove the options from configuration until supported.

No additional Feature Completeness findings beyond the items above.

---

## 5. STATE & DATA FLOW

1. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/client/src/pages/workbench.tsx:971`
   **Severity**: Medium
   **Category**: State & Data Flow
   **Description**: Issue status updates are optimistic but do not roll back on API failure (errors are swallowed). UI can diverge from server state.
   **Recommendation**: Await `updateIssueStatus`, handle errors, and roll back local state if the API call fails. Consider using React Query mutations with `onError`/`onSettled`.

2. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/client/src/lib/fix-engine.ts:158`
   **Severity**: Medium
   **Category**: State & Data Flow
   **Description**: `migrateIssueToCorrection` assumes `issue.rect` exists, but `IssueSchema.rect` is optional. If only `searchText` is available, applying a fix will throw.
   **Recommendation**: Add a fallback path that builds a `Location` with `search_text` when `rect` is missing, or enforce `rect` at ingestion.

3. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/client/src/lib/location-resolver.ts:78`
   **Severity**: Medium
   **Category**: State & Data Flow
   **Description**: `findBySearchText` assumes search results are arrays (`results.length`), but Nutrient returns an `Immutable.List`. This makes search-text fallback fail silently.
   **Recommendation**: Normalize search results to arrays (handle `Immutable.List` via `.size` and `.get`) or add adapter-level normalization.

No additional State & Data Flow findings beyond the items above.

---

## 6. SECURITY SURFACE

1. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/routes.ts:842`
   **Severity**: Critical
   **Category**: Security Surface
   **Description**: `/files/:documentId.pdf` and `/api/session/:documentId` are accessible without authentication. Anyone with a document ID can fetch the PDF or receive a document-engine JWT.
   **Recommendation**: Require authentication and authorization checks for both endpoints. Consider signed, time-limited URLs for file access.

2. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/routes.ts:532`
   **Severity**: High
   **Category**: Security Surface
   **Description**: `/api/claims/:claimId/documents` lacks authentication middleware and returns document metadata to any caller.
   **Recommendation**: Add `authenticateRequest` and verify ownership of the claim before returning documents.

3. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/storage.ts:201`, `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/storage.ts:467`, `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/storage.ts:940`
   **Severity**: Critical
   **Category**: Security Surface
   **Description**: The server uses the Supabase service role (bypassing RLS) but many read/write methods do not filter by `user_id`. Any authenticated user can read or modify other users’ records by ID.
   **Recommendation**: Enforce ownership in all storage methods (filter by `user_id`) and/or use a client scoped to the user JWT for reads/writes. Add authorization checks in routes before invoking storage methods.

4. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/routes.ts:44`
   **Severity**: Medium
   **Category**: Security Surface
   **Description**: A PDF magic-bytes validator exists but is never used. File type checks rely on extension/mime, which are easy to spoof.
   **Recommendation**: Call `validatePdfFile` after upload and before parsing/storage. Reject or quarantine files failing validation.

5. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/middleware/rate-limit.ts:1`
   **Severity**: Low
   **Category**: Security Surface
   **Description**: Rate limiting is in-memory and per-process. In multi-instance deployments, it provides little protection against abuse.
   **Recommendation**: Replace with a shared store (Redis) or a gateway-level rate limiter.

No additional Security Surface findings beyond the items above.

---

## 7. CROSS-CUTTING CONCERNS

1. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/server/index.ts:82`
   **Severity**: Medium
   **Category**: Cross-Cutting Concerns
   **Description**: API logging includes full JSON responses. This can leak PII and payloads into logs.
   **Recommendation**: Log metadata only (status, latency, requestId). Redact or omit response bodies in production.

2. **Location**: `/Users/johnshoust/Library/CloudStorage/Box-Box/Github Repos/Claims-iQ-Workbench/client/src/pages/workbench.tsx:1458`
   **Severity**: Low
   **Category**: Cross-Cutting Concerns
   **Description**: Icon-only buttons rely on `title` text but lack `aria-label`, which is insufficient for screen readers.
   **Recommendation**: Add `aria-label` to all icon-only buttons (e.g., toggle issues, annotations).

Additional checks: Error boundaries exist and are wired (`ErrorBoundary`), and responsive utility classes are used widely. No additional cross-cutting issues were identified from static review.

---

# Prioritized Remediation Checklist

1. Lock down all document/session endpoints and enforce authorization on every read/write that currently uses the service role without user scoping.
2. Resolve canonical schema drift: migrate to a single authoritative schema and add missing columns/FKs with explicit migrations.
3. Fix canonical writes to always include `claim_id` and `document_id`, and update shared schemas to carry them.
4. Fix upload response envelope mismatch to unblock the main upload flow.
5. Align `issues.rect` requirements between schema and DB and persist search fallback data.
6. Add request validation for update endpoints (annotation patches, status updates).
7. Add error/loading UI for critical data fetches and roll back optimistic updates on failure.
8. Normalize search results in `LocationResolver` and handle missing bbox in fix engine.
9. Replace in-memory rate limiting and reduce PII in logs.
10. Address low-severity hygiene: remove dead endpoints, complete adapters, add accessibility labels, and batch database writes.
