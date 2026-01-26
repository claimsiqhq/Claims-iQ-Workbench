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
- [x] **User Menu**: Sign-in/sign-out with user email display
- [x] **Progress Tracking**: Upload progress with stage indicators
- [x] **Issue Statistics**: Real-time counts of open, applied, and rejected issues

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

- [ ] **Before/After Preview**: Show visual diff of corrections before applying
- [ ] **Confidence Score Display**: Add confidence percentage to issue cards
- [ ] **Batch Operations**: Apply/reject multiple issues at once
- [ ] **Search & Filter**: Search issues by description, type, or value
- [ ] **Keyboard Shortcuts**: Navigate issues with arrow keys, apply with Enter
- [ ] **Export Corrected PDF**: Download button for corrected document
- [ ] **Undo/Redo**: Allow reverting applied corrections

### Low Priority

- [ ] **Dark Mode**: Add theme toggle support
- [ ] **Localization**: i18n support for multi-language
- [ ] **Accessibility**: WCAG 2.1 AA compliance audit
- [ ] **Performance Optimization**: Virtualize long issue lists
- [ ] **Offline Support**: Service worker for offline viewing
- [ ] **Real-time Collaboration**: Multi-user editing with conflict resolution

### Security & Compliance

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
- [ ] **Logging**: Structured server logs with log levels
- [ ] **Database Migrations**: Add migration tooling (Drizzle Kit or similar)
- [ ] **Backup Strategy**: Automated database and storage backups

### Documentation

- [ ] **API Documentation**: OpenAPI/Swagger spec for all endpoints
- [ ] **Component Storybook**: Visual component documentation
- [ ] **Onboarding Guide**: New developer setup instructions
- [ ] **Architecture Diagram**: Visual system architecture
- [ ] **Runbook**: Operational procedures for common issues

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

*Last updated: January 2026*
