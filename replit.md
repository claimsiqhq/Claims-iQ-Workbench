# Claims IQ Workbench

## Overview
Claims IQ Workbench is a human-in-the-loop document processing application designed to review and correct issues within PDF insurance claim documents. It allows users to upload PDF claim files, optionally with correction payloads, and leverages OpenAI's vision AI to extract structured data. The workbench features PDF viewing, highlights detected issues as annotations, and provides workflows for applying, manually editing, or rejecting corrections. All actions are audit-logged for compliance. The project is production-ready, featuring a Supabase backend, OpenAI-powered PDF parsing, canonical correction schemas, cross-document validation, and full authentication. The business vision is to streamline insurance claim processing, reduce manual errors, and improve efficiency for insurance professionals.

## User Preferences
- Preferred communication style: Simple, everyday language
- Prefers manual testing over automated testing subagent
- Documents should auto-load after upload (no manual "Load" step)

## System Architecture

### Tech Stack
The application is built with React 19 and TypeScript for the frontend, using Vite 7 for building, Tailwind CSS 4 with shadcn/ui for styling, TanStack Query v5 for server state, and Wouter for routing. The Nutrient Web SDK is used for PDF viewing. The backend runs on Node.js with Express 5, utilizing Supabase (PostgreSQL) for the database and Supabase Storage for file storage. Authentication is handled by Supabase Auth. OpenAI's gpt-4o vision API, accessed via Replit AI Integrations, powers AI/OCR functionalities. Schema validation is done using Zod and AJV.

### Key Design Patterns
- **Adapter Pattern**: PDF viewer operations are abstracted, allowing for flexible integration of different PDF processors.
- **Fix Engine with Fallback Strategy**: Corrections are applied through a cascading strategy: form field fill → content edit → redaction overlay.
- **Dual Location Strategy**: Content is located using precise bounding box coordinates with a fallback to search-text matching for resilience.
- **Canonical Schemas**: Data contracts for corrections, annotations, and validations are defined using Zod schemas, shared across frontend and backend.
- **Repository Pattern**: Database operations are abstracted behind a typed interface, with Supabase as the primary persistence layer and local filesystem as a fallback.
- **Non-destructive Editing**: Original PDFs are preserved; all changes are tracked as separate records.
- **Audit Logging**: All correction actions are logged with detailed before/after states, user ID, and timestamps for compliance.

### PDF Processing Pipeline
The upload flow involves receiving PDFs and optional correction JSON, converting PDFs to PNGs using `pdftoppm`, sending images to OpenAI gpt-4o vision API for structured data extraction, and then storing claim/document records in Supabase. Issues are created from the correction JSON, and the document is auto-loaded for correction workflow. OpenAI `gpt-4o` is used for high-detail extraction and low-detail OCR. The correction workflow involves loading issues, allowing auto-apply, manual edit, or rejection of corrections, with all actions generating audit log entries.

### Database
Supabase is used for the database, including tables for `claims`, `documents`, `issues`, `corrections`, `annotations`, `audit_logs`, `correction_schemas`, and `cross_document_validations`. Row Level Security (RLS) restricts data access. Correction validation schemas are stored in the `correction_schemas` table and managed by `server/schema-store.ts`, with a filesystem fallback. Supabase Storage is used for uploaded PDFs, with a local filesystem fallback.

### API Routes
Core API endpoints handle health checks, claim management, document uploads, correction and annotation management, cross-document validation, audit logging, and serving PDF files. All API routes require Supabase authentication. Rate limiting is implemented per IP.

### Frontend Pages
The main interface is the Workbench, with additional pages for Login, Profile, and Settings. The Workbench UI features a top bar for navigation, a left panel for issue lists, a central Nutrient PDF viewer, and a toggleable right panel for annotations or cross-document validation. User settings are stored in localStorage for notification preferences, display settings, and export options.

## External Dependencies
- **Supabase**: Provides database (PostgreSQL), authentication, and file storage services.
- **Nutrient Web SDK**: Used for displaying PDFs and managing annotations within the application.
- **OpenAI**: Specifically the `gpt-4o` vision API, integrated via Replit AI Integrations, for structured data extraction and OCR from PDF documents.
- **Zod**: A TypeScript-first schema declaration and validation library.
- **AJV**: Another JSON schema validator used for validating correction payloads.
- **pdftoppm**: A system utility for converting PDF pages into PNG images, used as part of the PDF processing pipeline.