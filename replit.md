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

### Backend Architecture
- **Runtime**: Node.js with Express
- **API Style**: RESTful JSON APIs
- **File Storage**: Local filesystem (`./storage/` for PDFs, `./data/` for JSON indexes and audit logs)
- **Authentication**: JWT (RS256) for Document Engine sessions
- **File Upload**: Multer middleware for multipart form handling

### Key Design Patterns
- **Fix Engine with Fallback Strategy**: Corrections attempt strategies in order: form field → content edit → redaction overlay
- **Issue Status Workflow**: Issues transition through OPEN → APPLIED | MANUAL | REJECTED states
- **Audit Logging**: All correction actions are logged with before/after states for compliance
- **Non-destructive Editing**: Original PDFs are never overwritten; edits are tracked separately

### Directory Structure
- `/client/src/` - React frontend application
- `/server/` - Express backend with routes, storage, and static serving
- `/shared/` - Shared TypeScript schemas and types (Zod + Drizzle)
- `/data/` - Runtime data storage (index.json, audit.log)
- `/storage/` - Uploaded PDF files

### Data Flow
1. Frontend fetches claims list and documents from backend
2. Session endpoint generates JWT tokens for Document Engine authentication
3. Issues are loaded per document and visualized as annotations on the PDF
4. Corrections trigger audit logs posted to the backend
5. Changes can be saved/exported through the Nutrient viewer instance

## External Dependencies

### PDF Processing
- **Nutrient Web SDK**: Client-side PDF viewer with annotation and editing capabilities
- **Nutrient Document Engine**: Optional server-backed PDF processing with JWT authentication

### Database
- **PostgreSQL**: Configured via Drizzle ORM (schema in `shared/schema.ts`)
- **Drizzle Kit**: Database migrations and schema management
- **Connection**: Requires `DATABASE_URL` environment variable

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (defaults to 5000)
- `DOC_ENGINE_URL` - Nutrient Document Engine URL (optional)
- `DOC_ENGINE_API_TOKEN` - Document Engine API token (optional)
- `JWT_PRIVATE_KEY_PEM` - RSA private key for JWT signing
- `JWT_EXPIRES_IN_SECONDS` - JWT expiration time
- `JWT_PERMISSIONS` - Comma-separated permissions for Document Engine
- `PUBLIC_BASE_URL` - Public URL for file access

### Third-Party Services
- No external APIs beyond Nutrient Document Engine (optional)
- All file storage is local filesystem-based