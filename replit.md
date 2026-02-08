# Claims IQ Workbench

## Overview
Claims IQ Workbench is a human-in-the-loop document correction application designed for insurance claim PDFs. It allows users to upload PDF claim files along with AI-generated correction payloads. The system highlights detected issues directly on the PDF, providing tools for in-place text corrections, manual edits, or rejection of issues. All user actions are meticulously audit-logged for compliance. The application enables users to download corrected, clean PDFs. The project aims to streamline the document correction process in insurance, reducing manual effort and improving data accuracy, with a vision to become a leading solution in automated yet human-supervised document processing.

## User Preferences
- Preferred communication style: Simple, everyday language
- Prefers manual testing over automated testing subagent
- Documents should auto-load after upload (no manual "Load" step)

## System Architecture
The application is built with a modern web stack, featuring a React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui frontend, and a Node.js, Express 5 backend. Data persistence is handled by Supabase PostgreSQL with Row Level Security (RLS) and Supabase Storage for files. Authentication is managed via Supabase Auth using JWTs. AI-driven OCR and vision capabilities are integrated through OpenAI gpt-4o vision via Replit AI Integrations.

**Core Design Patterns & Technical Implementations:**
- **PDF Viewing and Interaction**: Utilizes the Nutrient Web SDK for advanced PDF rendering, text search, annotation, and content editing. Corrections primarily leverage `beginContentEditingSession()` for in-place text replacement based on `search_text` (not pixel coordinates), ensuring non-destructive changes to the original PDF.
- **Data Handling**: Employs canonical Zod schemas for shared data structures between frontend and backend, ensuring data consistency. A Repository Pattern (`server/storage.ts`) abstracts all database operations.
- **Audit Logging**: All significant actions, including correction applications, rejections, and manual edits, are meticulously logged with before/after states and user information for compliance.
- **Correction Workflow**: Issues identified by AI are highlighted on the PDF. Users can apply suggested fixes via content editing, manually edit, or reject issues. Applying a fix initiates a content editing session to replace `foundValue` with `expectedValue`.
- **UI/UX**: The workbench features a clear layout with a top toolbar, a left panel for issue lists and filters, a central PDF viewer, and right panels for annotations and cross-document validations. Issue highlighting uses severity-based colors (red for critical, amber for warning, blue for info).

**Feature Specifications:**
- **Document Upload & Processing**: Users upload PDFs and optional correction JSON. The server processes these, extracting text using `pdftoppm` and OpenAI gpt-4o vision, generating issues, and persisting data to Supabase.
- **Issue Management**: Issues are displayed, highlighted, and can be filtered by status. Users can update issue statuses (OPEN, APPLIED, MANUAL, REJECTED).
- **Export Capabilities**: Corrected PDFs can be downloaded. Audit logs and issue reports are also exportable.

## External Dependencies
- **Supabase**: Used for PostgreSQL database, file storage (Supabase Storage), and user authentication (Supabase Auth).
- **Nutrient Web SDK**: (`@nutrient-sdk/viewer`) for interactive PDF viewing, annotation, text search, and content editing capabilities.
- **OpenAI**: Specifically `gpt-4o vision` for AI-powered PDF text extraction and field recognition, integrated via Replit AI Integrations.
- **Node.js Ecosystem**: Express for the backend API, Zod for runtime schema validation, AJV for JSON Schema validation.
- **pdf-parse / pdftoppm**: For initial PDF text extraction before OpenAI vision processing.