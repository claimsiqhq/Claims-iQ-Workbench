# Claims File Correction Workbench (Step 2)

This project is the **Step 2** module for Claims iQ Core:
Core detects issues in claim PDFs and returns structured JSON. This workbench loads the PDF + issue bundle, then enables:

- Auto-correction (with approvals where required)
- Human-in-the-loop editing
- Audit logging
- Version-safe document handling

The PDF UI is built on **Nutrient Web SDK** with **Document Engine** for server-backed editing and persistence.

---

## Core principles

1. Never overwrite the original document.
2. Human approval required for irreversible actions.
3. Full audit trail for every correction.
4. Prefer true content edits; fall back safely.

---

## Architecture Overview

- Frontend: React + Vite + Nutrient Web SDK
- Backend: Node.js + Express
- PDF Persistence: Nutrient Document Engine
- Storage: Local FS / S3 / Blob
- Data Contracts: Structured Issue Bundle JSON

---

## Running the Project

### Backend
```
cd apps/api
npm install
npm run dev
```

### Frontend
```
cd apps/web
npm install
npm run dev
```

---

## Database & Supabase

When Supabase is configured, the app uses **Supabase** for persistence (claims, documents, issues, audit logs) and **Supabase Auth** for sign-in, profile, and sign-out.

**Schema**

- `supabase/schema.sql` defines: `claims`, `documents`, `issues`, `audit_logs`, RLS policies, and storage bucket `documents`.
- **You must run this SQL once** in your Supabase project: **Dashboard → SQL Editor → paste and run** `supabase/schema.sql`.
- After that, the database is ready. The server’s `SupabaseStorage` checks for the schema and logs if it’s missing.

**Profile & Settings**

- **Profile**: Uses Supabase Auth only (`auth.users` + session). No extra tables.
- **Settings** (theme, default operator ID): Stored in the browser via `localStorage`; no database.

**When Supabase is not configured**

- The server uses in-memory storage (`MemStorage`). No database or migrations are required.

---

## Key Environment Variables

Backend:
- `DATABASE_URL` — not used for app persistence; Drizzle config exists but the app uses Supabase or MemStorage.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — required for Supabase persistence and auth.
- `DOC_ENGINE_URL`, `DOC_ENGINE_API_TOKEN`, `JWT_PRIVATE_KEY_PEM` — Nutrient Document Engine.
- `OPENAI_API_KEY` — optional; used for PDF extraction when uploading.

Frontend:
- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — for Supabase Auth (login, profile, sign-out).

---

## Editing Strategies

1. Form Field Update
2. Content Edit (preferred)
3. Redaction + Overlay (approval required)

---

## Security & Compliance

- Originals are immutable
- Audit logs are append-only
- JWTs are short-lived
- Redactions are irreversible

---

## License

Nutrient SDK is commercial software. Ensure licensing compliance.
