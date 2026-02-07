# Claims-iQ-Workbench Comprehensive Audit (CODE_REVIEW_001)

## Executive Summary
- **Total issues by severity**
  - **High:** 5
  - **Medium:** 12
  - **Low:** 4
- **Top 3 risks requiring immediate attention**
  1. Corrections persistence is incompatible with the database schema (missing `claim_id` column), which can cause write failures and data loss. (See DL1)
  2. Cross-document validations are persisted without a valid `claim_id`, despite the database requiring it; this breaks referential integrity and query reliability. (See DL2)
  3. Unauthenticated access to PDFs and document lists enables data exfiltration if IDs are guessed or leaked. (See SEC1, SEC2)
- **Overall production-readiness assessment:** **Not production-ready** until the high-severity data integrity and security gaps are addressed.

---

## 1) DATA LAYER INTEGRITY
### Findings
**DL1 (High) — Corrections schema/db mismatch (missing `claim_id` in DB)**
- **Location:** `shared/schemas/correction.schema.ts` L68-L78; `server/storage.ts` L720-L737; `supabase/schema.sql` L184-L211
- **Description:** The application schema requires `claim_id` and the storage layer inserts it, but the database table definition does not include a `claim_id` column. This will either fail writes or drop data silently depending on Supabase behavior.
- **Recommendation:** Add `claim_id` to the `corrections` table with a foreign key to `claims(claim_id)`, update storage to always set it, and backfill existing data.

**DL2 (High) — Cross-document validations missing claim linkage**
- **Location:** `shared/schemas/cross-document-validation.schema.ts` L35-L55; `server/storage.ts` L1048-L1101; `supabase/schema.sql` L231-L235
- **Description:** The validation schema omits `claim_id`, but the DB requires it. Storage inserts an empty string placeholder, which is semantically invalid and breaks claim-scoped queries.
- **Recommendation:** Add `claim_id` to the validation schema and ensure route handlers supply it; enforce a foreign key to `claims(claim_id)`.

**DL3 (High) — Issues `rect` optional vs DB `NOT NULL`**
- **Location:** `shared/schema.ts` L34-L47; `server/storage.ts` L380-L407, L441-L452; `supabase/schema.sql` L38-L47
- **Description:** The API schema allows `rect` to be optional/null and storage explicitly nulls invalid rects, but the DB schema requires `rect NOT NULL`. Inserts can fail or store invalid data depending on client payload.
- **Recommendation:** Align the schema: either make `rect` nullable in DB or enforce non-null validation at API boundary and provide a deterministic fallback.

**DL4 (Medium) — Drizzle schema incomplete for domain entities**
- **Location:** `shared/schema.ts` L6-L18
- **Description:** The Drizzle schema only defines `users`, while the rest of the app relies on `claims`, `documents`, `issues`, and canonical tables in Supabase. This increases schema drift risk and weakens type safety.
- **Recommendation:** Add Drizzle models for all core tables or remove unused Drizzle artifacts to avoid false confidence.

**DL5 (Medium) — Type mismatch for `date_of_loss`**
- **Location:** `shared/schema.ts` L71-L79; `supabase/schema.sql` L8-L16
- **Description:** The app models `dateOfLoss` as a string while the DB stores it as `DATE`, creating parsing ambiguity and inconsistent validation.
- **Recommendation:** Normalize to ISO date strings at API boundaries or update the schema to use a consistent type in both layers.

**DL6 (Medium) — Missing foreign keys on canonical tables**
- **Location:** `supabase/schema.sql` L184-L211, L214-L229, L231-L240
- **Description:** `corrections.document_id`, `annotations.document_id`, and `cross_document_validations.claim_id` lack foreign key constraints. Orphan rows become possible when documents or claims are deleted.
- **Recommendation:** Add FK constraints to enforce referential integrity and cascade behavior.

**DL7 (Medium) — Migration safety gaps for base schema**
- **Location:** `supabase/schema.sql` L1-L2
- **Description:** The base schema is a monolithic SQL file intended for manual execution, which is not versioned or reversible. This makes production rollbacks error-prone.
- **Recommendation:** Convert base schema changes into versioned migrations with rollbacks.

**DL8 (Medium) — N+1 upsert pattern in `saveIssues`**
- **Location:** `server/storage.ts` L436-L463
- **Description:** Each issue is upserted individually, increasing round-trips and latency for large payloads.
- **Recommendation:** Use bulk upsert with batched insert/update operations.

**Confirmations:** No issues found with primary key uniqueness or existing indexes on claim/document/issue tables beyond the gaps listed above.

---

## 2) API SURFACE AUDIT
### Findings
**AP1 (Medium) — Missing request validation for annotation updates**
- **Location:** `server/routes.ts` L1203-L1215
- **Description:** PATCH `/api/annotations/:annotationId` accepts arbitrary fields with no schema validation, creating a risk of invalid state or unexpected persistence errors.
- **Recommendation:** Validate updates against a schema (e.g., allow only `text`, `color`, `location` with Zod).

**AP2 (Low) — Response envelope inconsistency**
- **Location:** `server/routes.ts` L532-L558
- **Description:** `/api/claims/:claimId/documents` returns raw arrays instead of the standard `{ data: ... }` envelope used elsewhere, forcing client-side special cases.
- **Recommendation:** Standardize responses with `sendSuccess` and consistent error envelopes.

**AP3 (Medium) — Claims CRUD is incomplete**
- **Location:** `server/routes.ts` L506-L558
- **Description:** The API exposes `GET /api/claims` but lacks explicit endpoints to create/update/delete claims without uploading a document, limiting admin workflows and complicating UI flows.
- **Recommendation:** Add explicit `POST/PUT/DELETE` endpoints or document why claims are only created through uploads.

**Confirmations:** No orphaned route definitions were found; all declared routes have handler implementations in `server/routes.ts`.

---

## 3) UI ↔ API CONTRACT
### Findings
**UI1 (Medium) — Auth mismatch for uploads**
- **Location:** `client/src/lib/api.ts` L157-L173; `server/routes.ts` L741-L742
- **Description:** The UI uploads documents via `fetch` without authorization headers, but the server requires `authenticateRequest`, leading to 401s in authenticated deployments.
- **Recommendation:** Use `authenticatedFetch` or attach the bearer token for the upload request.

**UI2 (Medium) — Upload response shape mismatch**
- **Location:** `client/src/lib/api.ts` L157-L173; `server/routes.ts` L835-L835
- **Description:** `uploadDocument` expects `{ claimId, documentId }`, but the server wraps the response in the standard success envelope. This can cause incorrect parsing if the caller expects raw fields.
- **Recommendation:** Unwrap `data` in the client or return raw JSON consistently on the server.

**UI3 (Low) — Dead endpoint**
- **Location:** `server/routes.ts` L389-L391
- **Description:** `/api/metrics` appears unused by the UI (no references found in client code), increasing surface area without clear value.
- **Recommendation:** Remove, protect, or document this endpoint’s usage.

**Confirmations:** UI calls for health, claims, documents, issues, corrections, annotations, and validations align with available API routes.

---

## 4) FEATURE COMPLETENESS
### Findings
**F1 (Medium) — Unimplemented PDF adapter types**
- **Location:** `client/src/lib/adapters/adapter-factory.ts` L17-L30
- **Description:** The factory throws runtime errors for `pdfjs` and `custom` adapters, which makes the UI fragile if configuration switches away from `nutrient`.
- **Recommendation:** Either implement the adapters or guard configuration to prevent unsupported values.

**F2 (Medium) — Annotation creation relies on a two-step DB write**
- **Location:** `server/storage.ts` L884-L897
- **Description:** `createAnnotation` inserts rows with an empty `document_id`, then relies on a follow-up update in the route handler. If the update fails, orphaned annotations remain.
- **Recommendation:** Require `document_id` in the API payload and insert it atomically.

**Confirmations:** No other explicit TODO/FIXME markers found in core application code paths beyond the adapter factory.

---

## 5) STATE & DATA FLOW
### Findings
**S1 (Medium) — In-memory annotations ignore document filtering**
- **Location:** `server/storage.ts` L1397-L1400
- **Description:** `MemStorage.getAnnotations` returns annotations without filtering by `documentId`, risking cross-document leakage and inconsistent behavior between dev/prod.
- **Recommendation:** Filter by `documentId` in the in-memory implementation to match the Supabase behavior.

**S2 (Low) — Infinite cache staleness in React Query**
- **Location:** `client/src/lib/queryClient.ts` L31-L51
- **Description:** Queries are configured with `staleTime: Infinity` and no invalidation logic in this module, increasing the chance of stale UI data after mutations.
- **Recommendation:** Introduce targeted invalidation or shorter stale windows for mutable resources.

**Confirmations:** No obvious memory leaks from subscriptions/intervals were identified in the reviewed modules.

---

## 6) SECURITY SURFACE
### Findings
**SEC1 (High) — Unauthenticated PDF access**
- **Location:** `server/routes.ts` L842-L869
- **Description:** `/files/:documentId.pdf` is publicly accessible with only an ID check. Anyone with a document ID can retrieve a PDF.
- **Recommendation:** Require authentication and verify user ownership (claim/document) before serving files.

**SEC2 (High) — Unauthenticated document listing**
- **Location:** `server/routes.ts` L532-L558
- **Description:** `/api/claims/:claimId/documents` lacks authentication and returns document metadata for any valid claim ID.
- **Recommendation:** Enforce authentication and ownership checks consistent with other claim/document endpoints.

**SEC3 (Medium) — PDF validation only checks extension/mime**
- **Location:** `server/routes.ts` L44-L79
- **Description:** Uploads rely on extension/mime validation; the stronger PDF magic-byte check is defined but unused, making it easier to upload non-PDF content.
- **Recommendation:** Invoke `validatePdfFile` after file upload and reject invalid files.

**SEC4 (Medium) — In-memory rate limiting not production-safe**
- **Location:** `server/middleware/rate-limit.ts` L1-L7
- **Description:** The rate limiter uses per-process memory, which is ineffective in multi-instance deployments and resets on restarts.
- **Recommendation:** Replace with a shared store (Redis) for production.

**Confirmations:** CORS is restricted to a configurable allow list; no raw SQL or `eval` usage found in reviewed files.

---

## 7) CROSS-CUTTING CONCERNS
### Findings
**CC1 (Low) — No automated accessibility checks**
- **Location:** `package.json` L6-L15
- **Description:** The repo scripts do not include linting or testing for accessibility, which increases the risk of regressions in ARIA, keyboard navigation, or contrast.
- **Recommendation:** Add an accessibility lint/test step (e.g., eslint-plugin-jsx-a11y, Playwright axe).

**Confirmations:** Error boundaries exist in the React app; request logging and request IDs are wired in the API.

---

## Prioritized Remediation Checklist
1. **Fix data-model mismatches**: add `claim_id` to `corrections`, align cross-document validations, and reconcile `rect` nullability. (DL1, DL2, DL3)
2. **Lock down document access**: require auth + ownership for `/files/:documentId.pdf` and `/api/claims/:claimId/documents`. (SEC1, SEC2)
3. **Stabilize upload flows**: ensure the client authenticates upload requests and handles response envelopes consistently. (UI1, UI2)
4. **Add foreign keys + migrations**: enforce referential integrity and move base schema into reversible migrations. (DL6, DL7)
5. **Harden validation**: validate PATCH payloads and enforce PDF magic-byte checks on uploads. (AP1, SEC3)
6. **Address state divergences**: fix in-memory annotation filtering and revisit React Query cache staleness strategy. (S1, S2)
7. **Complete adapter options and cleanup dead endpoints**: implement or guard PDF adapters and remove/secure unused routes. (F1, UI3)
8. **Add cross-cutting quality gates**: introduce accessibility testing and production-grade rate limiting. (CC1, SEC4)
