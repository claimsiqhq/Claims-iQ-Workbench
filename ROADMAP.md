# Claims IQ Workbench — What’s Next

Prioritized suggestions, enhancements, and underdeveloped areas. Use this with `DEVELOPER_GUIDELINES.md` for planning.

---

## Critical / security / multi-tenancy

### 1. **API auth + user-scoped data**

Right now the backend does **not** know who is calling. The client never sends a Bearer token, and routes never pass `userId` to storage.

- **Effect:** With Supabase, `getClaims()` returns all claims; uploads/createClaim/createDocument/saveIssues/logAudit run without a user. RLS still applies when the **Supabase client** is used with a user context, but your **Express API** uses the service-role client and calls storage without `userId`, so everything is effectively global.
- **Needed:**  
  - Middleware to validate JWT (e.g. Supabase `auth.getUser(token)` or your own JWT) and attach `req.userId`.  
  - Send `Authorization: Bearer <supabase_session_access_token>` (or equivalent) from the client for all API calls.  
  - Pass `req.userId` into `storage.getClaims(userId)`, `createClaim(..., userId)`, `createDocument(..., userId)`, `saveIssues(..., userId)`, `logAudit(..., userId)`, and into `uploadToSupabaseStorage(..., userId)` so files go under `userId/...`.

### 2. **Route guards**

- `/profile` already redirects to `/login` when auth is configured and user is missing.  
- Consider: redirect unauthenticated users from `/` (workbench) to `/login` when auth is configured, if you want the workbench to be signed-in only.

### 3. **Rate limiting & input hardening**

- Add rate limiting on `/api/documents/upload`, `/api/audit`, and other heavy or write endpoints.  
- Review request bodies and query params for XSS/injection; keep using schema validation (e.g. Zod) on all inputs.

---

## Underdeveloped features (from guidelines + codebase)

### 4. **Tests**

- **Unit:** Schema (Zod in `shared/schema.ts`), fix-engine matching (`client/src/lib/fix-engine.ts`), PDF parser (`server/pdf-parser.ts`), storage interface.  
- **Integration:** Load document → apply fix → audit; upload → parse → claim; sign up / sign in / sign out.  
- **Fixtures:** A few golden PDFs + expected issue bundles for regression.

### 5. **Document Engine usage**

- JWT + session generation exist, but a real Nutrient Document Engine backend is external.  
- When `DOC_ENGINE_URL` / `JWT_PRIVATE_KEY_PEM` are missing, the app correctly falls back to view-only (e.g. `autoSaveMode: "DISABLED"`).  
- Next step: document the exact env vars and how to plug in your Document Engine, and add a small “Document Engine status” hint in the UI (e.g. in Settings or next to session info).

### 6. **Viewer error handling**

- `useNutrientViewer` exposes `error` when the viewer fails to load; the workbench only uses `isLoading` and shows “Loading document viewer”.  
- **Enhancement:** In the viewer area, if `error` is set, show a clear message and a “Retry” or “Reload document” action.

### 7. **Before/after preview & batch actions**

- **Before/after:** Show a simple diff or side-by-side of “found vs expected” (or before/after correction) before applying.  
- **Batch:** “Apply all open” / “Reject all” (or multi-select) with a single confirmation.

### 8. **Search and keyboard UX**

- Search/filter issues by text (e.g. type, label, found/expected).  
- Keyboard: e.g. arrow keys to move between issues, Enter to apply, Esc to cancel.

### 9. **Undo / redo**

- Allow reverting the last applied correction (e.g. revert status + restore previous value where feasible). This may require storing “previous value” in audit or in issue state.

---

## UX and UI polish

### 10. **404 page**

- `not-found.tsx` still uses raw `bg-gray-50`, `text-gray-900`, etc.  
- **Enhancement:** Use Claims IQ tokens (`bg-background`, `text-foreground`, etc.) and add a “Back to Workbench” button that routes to `/`.

### 11. **Profile**

- Profile is read-only (email, display name, last sign-in).  
- Optional later: editable display name or avatar (e.g. Supabase `user_metadata` or a `profiles` table).

### 12. **Settings**

- Theme and default operator ID are in place.  
- Possible additions: default claim list sort, notification preferences, or “Document Engine” info as in (§5).

### 13. **Empty and loading states**

- Workbench already has “no claims” / “no documents” and viewer loading.  
- Ensure every major section has a clear empty state (e.g. “No issues,” “No audit entries”) and that loading skeletons or spinners are consistent.

---

## Infrastructure and docs

### 14. **CI/CD**

- GitHub Actions (or similar): lint, TypeScript, unit tests, and a simple build.  
- Optionally: run integration tests or E2E on a branch.

### 15. **Logging and monitoring**

- Structured server logs (e.g. request id, user id when available, status, duration).  
- Error tracking (e.g. Sentry) for backend and/or frontend, with PII kept out of events.

### 16. **API and runbooks**

- OpenAPI (or Swagger) for all REST endpoints.  
- Short runbooks: “Schema not valid” → run `supabase/schema.sql`; “Upload fails” → check env and Doc Engine; “Auth not working” → check Supabase URL/keys.

### 17. **Accessibility and performance**

- Target WCAG 2.1 AA where practical (focus, labels, contrast, keyboard flow).  
- If issue lists can grow large, virtualize the list (e.g. `react-window` or similar) to keep scrolling smooth.

---

## Quick reference — already in good shape

- Profile, Settings, Sign out implemented and wired.  
- Theme (light/dark/system) and default operator ID persisted and applied.  
- Supabase schema and RLS defined; run `supabase/schema.sql` in the project.  
- Health check and schema-valid banner; upload flow with drag-and-drop and extraction.  
- Claims IQ branding, layout, and navigation are in place.

Use this roadmap and `DEVELOPER_GUIDELINES.md` together when planning sprints or backlog.
