# Developer Guidelines — Claims File Correction Workbench

This document defines the engineering and architectural rules for this repository, along with the current implementation status and outstanding tasks.

---

## Non-Negotiables

- Never overwrite original PDFs
- Redactions require explicit approval
- All edits must be auditable

---

## Engineering Standards

- TypeScript preferred everywhere
- Validate all external inputs
- No secrets committed
- Minimal JWT permissions

---

## Issue Lifecycle

OPEN → APPLIED | MANUAL | REJECTED

Resolution state must be stored separately from detection data.

---

## Coordinate Rules

- Use viewer coordinates (top-left origin)
- Never guess bounding boxes
- Log coordinate mismatches

---

## Fix Engine Rules

Fallback order:
1. Form Field
2. Content Edit
3. Redaction Overlay

Never replace text blindly.

---

## UI Rules

- Always show before/after
- Confidence must be visible
- Manual edit must be available

---

## Backend Rules

- JWTs are short-lived
- Audit logs are append-only
- Document Engine tokens never exposed to client

---

## Testing

- Unit: schema + matching logic
- Integration: load → fix → audit
- Maintain golden PDF samples

---

## PR Checklist

- Tests pass
- Types clean
- Audit logging included
- UI screenshots provided

---

## Hard Truths

PDF editing is not word processing.
Fallbacks exist for a reason.
Ship safety before speed.

---

## Current Implementation Status

### Completed Features

- [x] **PDF Viewing**: Nutrient Web SDK integration for viewing PDF documents
- [x] **Issue Detection Visualization**: Color-coded severity badges (CRITICAL/HIGH/MEDIUM/LOW) displayed as annotations on PDF
- [x] **Correction Workflows**: 
  - Auto-apply with fallback strategy (form field → content edit → redaction overlay)
  - Manual editing mode
  - Rejection workflow with reason capture
- [x] **Issue Filtering**: Filter issues by status (All, Open, Applied, Rejected)
- [x] **Audit Logging**: Complete audit trail with before/after states, timestamps, and user tracking
- [x] **PDF Upload**: File upload with multer middleware
- [x] **Drag-and-Drop Interface**: Global page-level drop zone with visual overlay
- [x] **AI-Powered Claim Extraction**: OpenAI integration for extracting claim information from PDFs (when API key configured)
- [x] **Supabase Integration**:
  - Email/password authentication
  - PostgreSQL database for claims, documents, issues, and audit logs
  - Storage bucket for PDF files organized by user_id
  - Row Level Security (RLS) policies
- [x] **Graceful Fallback**: Local filesystem storage when Supabase is not configured
- [x] **Schema Validation**: Health endpoint with schema status check and warning banner
- [x] **User Menu**: Account dropdown (gear) with Profile, Settings, Sign out; Sign in only when auth configured and not logged in
- [x] **Profile Page**: Full profile view (email, display name, last sign-in, avatar/initials) at `/profile`; redirects to login when auth configured and unauthenticated
- [x] **Settings Page**: Theme (light/dark/system) and default operator ID at `/settings`; persisted in localStorage
- [x] **Progress Tracking**: Upload progress with stage indicators
- [x] **Issue Statistics**: Real-time counts of open, applied, and rejected issues
- [x] **Professional UI Redesign**: Complete UI overhaul with proper sizing (h-10 minimum), spacing (p-6), typography (text-sm/base), and visual polish
- [x] **Automatic Claim ID Generation**: AI-powered extraction eliminates need for manual claim ID input
- [x] **Enhanced Upload Dialog**: Drag-and-drop interface with visual feedback and extracted information display

### Partially Implemented

- [ ] **Document Engine Integration**: JWT generation is implemented but requires external Document Engine server
- [ ] **Form Field Fixes**: Implementation exists but depends on PDF having form fields
- [ ] **Content Edit Fixes**: Implementation exists but depends on Nutrient SDK content editing API availability

---

## Outstanding Tasks Checklist

### High Priority

- [ ] **Unit Tests**: Add Jest/Vitest tests for:
  - [ ] Schema validation (Zod schemas in `shared/schema.ts`)
  - [ ] Fix engine matching logic (`client/src/lib/fix-engine.ts`)
  - [ ] PDF parser extraction (`server/pdf-parser.ts`)
  - [ ] Storage interface methods (`server/storage.ts`)

- [ ] **Integration Tests**: Add end-to-end tests for:
  - [ ] Load document → apply fix → verify audit log workflow
  - [ ] Upload → parse → create claim workflow
  - [ ] Authentication flow (sign up, sign in, sign out)

- [ ] **Golden PDF Samples**: Create test fixtures directory with:
  - [ ] Sample PDF with known issues for regression testing
  - [ ] Expected issue bundle JSON for validation
  - [ ] Expected audit log format

### Medium Priority

- [x] **Before/After Display**: Shows found/expected values in issue cards (completed)
- [x] **Confidence Score Display**: Confidence percentage displayed in issue cards (completed)
- [x] **Export Corrected PDF**: Download button for corrected document (completed)
- [ ] **Before/After Preview**: Show visual diff of corrections before applying (enhancement)
- [ ] **Batch Operations**: Apply/reject multiple issues at once
- [ ] **Search & Filter**: Search issues by description, type, or value
- [ ] **Keyboard Shortcuts**: Navigate issues with arrow keys, apply with Enter
- [ ] **Undo/Redo**: Allow reverting applied corrections

### Low Priority

- [x] **Dark Mode**: Theme toggle (light/dark/system) in Settings (completed)
- [ ] **Localization**: i18n support for multi-language
- [ ] **Accessibility**: WCAG 2.1 AA compliance audit
- [ ] **Performance Optimization**: Virtualize long issue lists
- [ ] **Offline Support**: Service worker for offline viewing
- [ ] **Real-time Collaboration**: Multi-user editing with conflict resolution

### Security & Compliance

- [ ] **API Auth + User-Scoped Data (Critical)**: The backend does not currently know who is calling. The client never sends a Bearer token, and routes never pass `userId` to storage. With Supabase, `getClaims()` returns all claims and uploads are not tied to a user. **Needed:** (1) Middleware to validate JWT (e.g. Supabase `auth.getUser(token)`) and attach `req.userId`; (2) Client sends `Authorization: Bearer <supabase_session_access_token>` on all API calls; (3) Pass `req.userId` into every storage call (`getClaims(userId)`, `createClaim(..., userId)`, `createDocument(..., userId)`, `saveIssues(..., userId)`, `logAudit(..., userId)`) and into `uploadToSupabaseStorage(..., userId)` so files go under `userId/...`.
- [ ] **Route Guards**: Consider redirecting unauthenticated users from `/` (workbench) to `/login` when auth is configured, if the workbench should be sign-in only. `/profile` already redirects when needed.
- [ ] **Review JWT Exposure**: Verify Document Engine tokens are not exposed to client (see Backend Rules)
- [ ] **Rate Limiting**: Add API rate limiting for upload and audit endpoints
- [ ] **Input Sanitization**: Audit all user inputs for XSS/injection vectors
- [ ] **Audit Log Integrity**: Implement append-only verification (checksums or blockchain-style chaining)
- [ ] **Session Timeout**: Auto-logout after inactivity period

### Infrastructure

- [ ] **CI/CD Pipeline**: Set up GitHub Actions for:
  - [ ] Linting (ESLint, TypeScript)
  - [ ] Unit tests
  - [ ] Integration tests
  - [ ] Build verification
- [ ] **Monitoring**: Add error tracking (Sentry or similar)
- [ ] **Logging**: Structured server logs with log levels (request id, user id when available, status, duration)
- [ ] **Database Migrations**: Add migration tooling (Drizzle Kit or similar)
- [ ] **Backup Strategy**: Automated database and storage backups

### Documentation

- [ ] **API Documentation**: OpenAPI/Swagger spec for all endpoints
- [ ] **Runbook**: Short operational procedures: “Schema not valid” → run `supabase/schema.sql`; “Upload fails” → check env and Doc Engine; “Auth not working” → check Supabase URL/keys
- [ ] **Component Storybook**: Visual component documentation
- [ ] **Onboarding Guide**: New developer setup instructions
- [ ] **Architecture Diagram**: Visual system architecture

---

## Suggestions, Enhancements & What's Next

Prioritized suggestions and underdeveloped areas for planning sprints and backlog.

### Critical / Security / Multi-Tenancy

- **API auth + user-scoped data**: See Security & Compliance above. This is the single highest-impact change for multi-user use.
- **Rate limiting & input hardening**: Add rate limits on `/api/documents/upload`, `/api/audit`, and other heavy or write endpoints. Keep validating all inputs (e.g. Zod) and review for XSS/injection.

### Underdeveloped Features

- **Tests**: Unit (schema, fix-engine, PDF parser, storage); integration (load → fix → audit, upload → parse → claim, auth flows); golden PDF samples + expected issue bundles.
- **Document Engine**: JWT/session generation exists but requires external Document Engine. Document env vars and plug-in steps; optional: “Document Engine status” hint in UI (e.g. Settings).
- **Viewer error handling**: `useNutrientViewer` exposes `error` when the viewer fails to load; the workbench only shows “Loading document viewer.” Add a clear error message and “Retry” or “Reload document” in the viewer area when `error` is set.
- **Before/after preview & batch**: Before/after diff or side-by-side before applying; “Apply all open” / “Reject all” or multi-select with one confirmation.
- **Search & keyboard**: Search/filter issues by text (type, label, found/expected). Keyboard: e.g. arrow keys between issues, Enter to apply, Esc to cancel.
- **Undo/redo**: Revert last applied correction (requires “previous value” in audit or issue state).

### UX and UI Polish

- **404 page**: `not-found.tsx` uses raw `bg-gray-50` / `text-gray-900`. Use Claims IQ tokens (`bg-background`, `text-foreground`) and add “Back to Workbench” → `/`.
- **Profile**: Read-only is done. Optional later: editable display name or avatar (Supabase `user_metadata` or `profiles` table).
- **Settings**: Theme and default operator ID are in place. Possible additions: claim list sort default, “Document Engine” status, notification preferences.
- **Empty and loading states**: Ensure every major section has a clear empty state (“No issues,” “No audit entries”) and consistent loading treatment.
- **Dark mode**: Theme toggle is implemented in Settings (light/dark/system). Mark complete in Low Priority once verified.

### Infrastructure and Docs

- **CI/CD**: Lint, TypeScript, unit tests, build in GitHub Actions or similar.
- **Logging and monitoring**: Structured server logs; error tracking (e.g. Sentry) with PII kept out of events.
- **API and runbooks**: OpenAPI for all REST endpoints; short runbooks for common ops issues.
- **Accessibility and performance**: WCAG 2.1 AA where practical; virtualize long issue lists (e.g. `react-window`) if needed.

### Quick Reference — Already in Good Shape

- Profile, Settings, Sign out implemented and wired.
- Theme (light/dark/system) and default operator ID persisted and applied.
- Supabase schema and RLS defined; run `supabase/schema.sql` in the project.
- Health check and schema-valid banner; upload flow with drag-and-drop and extraction.
- Claims IQ branding, layout, and navigation in place.

---

## Environment Variables

### Required for Full Functionality

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL (frontend) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (frontend) |
| `SUPABASE_URL` | Supabase project URL (backend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (backend) |
| `OPENAI_API_KEY` | OpenAI API key for claim extraction |

### Optional

| Variable | Purpose |
|----------|---------|
| `DOC_ENGINE_URL` | Nutrient Document Engine URL |
| `DOC_ENGINE_API_TOKEN` | Document Engine API token |
| `JWT_PRIVATE_KEY_PEM` | RSA private key for JWT signing |
| `JWT_EXPIRES_IN_SECONDS` | JWT expiration time |
| `JWT_PERMISSIONS` | Comma-separated permissions |
| `PUBLIC_BASE_URL` | Public URL for file access |

---

## Directory Structure

```
├── client/src/           # React frontend
│   ├── components/       # UI components (shadcn/ui)
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utilities (API, fix-engine)
│   └── pages/            # Page components (workbench, login)
├── server/               # Express backend
│   ├── routes.ts         # API endpoints
│   ├── storage.ts        # Data persistence layer
│   ├── supabase.ts       # Supabase client configuration
│   └── pdf-parser.ts     # OpenAI PDF parsing
├── shared/               # Shared TypeScript types
│   └── schema.ts         # Zod schemas and types
├── supabase/             # Supabase configuration
│   └── schema.sql        # Database schema (run in Supabase SQL Editor)
├── data/                 # Local fallback storage
└── storage/              # Local PDF storage
```

---

## Quick Start for New Developers

1. Clone the repository
2. Run `npm install`
3. Configure environment variables (see above)
4. If using Supabase:
   - Create project at supabase.com
   - Run `supabase/schema.sql` in SQL Editor
   - Add credentials to environment
5. Run `npm run dev` to start development server
6. Access at http://localhost:5000

---

---

## Recent Updates (January 2026)

### UI/UX Improvements
- **Complete UI Redesign**: Implemented professional design system with:
  - Minimum component height of 40px (h-10) for better usability
  - Consistent spacing system (p-6 for cards, px-6 for containers)
  - Improved typography scale (removed text-xs from primary UI)
  - Enhanced visual hierarchy with proper shadows, borders, and spacing
  - Wider sidebar (420px) for better issue card readability
  - Professional header with better organization and sizing

### Feature Enhancements
- **Automatic Claim Extraction**: PDF upload now automatically extracts claim information using OpenAI
- **Enhanced Upload Experience**: Drag-and-drop interface with progress tracking and visual feedback
- **Improved Issue Cards**: Better visual design with status indicators, severity colors, and clearer action buttons

---

*Last updated: January 26, 2026*
