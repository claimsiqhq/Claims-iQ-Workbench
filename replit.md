# Claims File Correction Workbench

## Overview

This is a "Human-in-the-loop" document processing workbench for reviewing and correcting issues in PDF claim documents. The application integrates with Nutrient Web SDK and Document Engine to provide PDF viewing, issue detection visualization, and correction workflows. Users can load PDF documents, view detected issues highlighted on the document, and apply corrections through auto-apply, manual editing, or rejection workflows.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 19 with Vite as the build tool
- **Language**: TypeScript throughout
- **Styling**: Tailwind CSS with Radix UI primitives (shadcn/ui component library)
- **State Management**: TanStack Query for server state, React useState for local state
- **Routing**: Wouter for lightweight client-side routing
- **PDF Viewing**: Nutrient Web SDK (`@nutrient-sdk/viewer`) loaded via CDN mode
- **Authentication**: Supabase Auth with email/password login

### Backend Architecture
- **Runtime**: Node.js with Express
- **API Style**: RESTful JSON APIs
- **Database**: Supabase (PostgreSQL) for claims, documents, issues, and audit logs
- **File Storage**: Supabase Storage for PDF files (with local fallback)
- **Authentication**: Supabase Auth + JWT (RS256) for Document Engine sessions
- **File Upload**: Multer middleware for multipart form handling

### Key Design Patterns
- **Fix Engine with Fallback Strategy**: Corrections attempt strategies in order: form field → content edit → redaction overlay
- **Issue Status Workflow**: Issues transition through OPEN → APPLIED | MANUAL | REJECTED states
- **Audit Logging**: All correction actions are logged with before/after states for compliance
- **Non-destructive Editing**: Original PDFs are never overwritten; edits are tracked separately
- **Graceful Fallback**: When Supabase is not configured, falls back to local file storage

### Directory Structure
- `/client/src/` - React frontend application
- `/server/` - Express backend with routes, storage, and static serving
- `/shared/` - Shared TypeScript schemas and types (Zod + Drizzle)
- `/supabase/` - Supabase SQL schema for database setup
- `/data/` - Runtime data storage (local fallback)
- `/storage/` - Uploaded PDF files (local fallback)

### Data Flow
1. Frontend fetches claims list and documents from backend
2. Backend queries Supabase database (or local storage as fallback)
3. Session endpoint generates JWT tokens for Document Engine authentication
4. Issues are loaded per document and visualized as annotations on the PDF
5. Corrections trigger audit logs stored in Supabase
6. PDFs are stored in Supabase Storage bucket

## Supabase Integration

### Setup Instructions
1. Create a Supabase project at https://supabase.com
2. Add the following secrets to your Replit project:
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Public anon key for frontend auth
   - `SUPABASE_URL` - Same as VITE_SUPABASE_URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Service role key for backend operations
3. Run the SQL schema in Supabase SQL Editor:
   - Open `supabase/schema.sql`
   - Copy and paste into Supabase SQL Editor
   - Execute to create tables and storage bucket

### Database Schema
- **claims** - Claim records with claim_id, policy_number, status, etc.
- **documents** - Document metadata linked to claims
- **issues** - Detected issues with severity, location, and status
- **audit_logs** - Compliance audit trail for all corrections

### Storage
- **documents** bucket - Stores uploaded PDF files
- Files organized by user_id for Row Level Security

### Authentication
- Email/password authentication via Supabase Auth
- Row Level Security (RLS) policies restrict data access by user
- Login page at `/login`

## External Dependencies

### PDF Processing
- **Nutrient Web SDK**: Client-side PDF viewer with annotation and editing capabilities
- **Nutrient Document Engine**: Optional server-backed PDF processing with JWT authentication

### Database
- **Supabase**: Cloud PostgreSQL database with auth, storage, and real-time capabilities
- **Fallback**: Local filesystem storage when Supabase is not configured

### Environment Variables Required
- `VITE_SUPABASE_URL` - Supabase project URL (frontend)
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key (frontend)
- `SUPABASE_URL` - Supabase project URL (backend)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (backend)
- `DOC_ENGINE_URL` - Nutrient Document Engine URL (optional)
- `DOC_ENGINE_API_TOKEN` - Document Engine API token (optional)
- `JWT_PRIVATE_KEY_PEM` - RSA private key for JWT signing (optional)
- `JWT_EXPIRES_IN_SECONDS` - JWT expiration time (optional)
- `JWT_PERMISSIONS` - Comma-separated permissions for Document Engine (optional)
- `PUBLIC_BASE_URL` - Public URL for file access (optional)

### Third-Party Services
- **Supabase**: Database, authentication, and file storage
- **Nutrient Document Engine**: Optional PDF processing backend
