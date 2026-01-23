# Claims File Correction Workbench

A professional "Human-in-the-loop" document processing interface that integrates with Nutrient Web SDK and Document Engine for PDF review and issue correction.

## Features

- **PDF Document Viewer**: Load and view PDF documents using Nutrient Web SDK
- **Document Engine Integration**: Full server-backed PDF processing with JWT authentication
- **Issue Detection & Visualization**: Automatically highlight detected issues with color-coded severity levels
- **Smart Correction Workflows**:
  - **Auto-Apply**: Automatic corrections with fallback strategies (form fields → content editing → redaction overlay)
  - **Manual Edit**: Use Nutrient viewer tools for manual corrections
  - **Reject**: Mark issues as false positives
- **Issue Management**: Filter issues by status (All, Open, Applied, Rejected)
- **Audit Logging**: Complete audit trail with file persistence
- **PDF Upload**: Upload documents with associated issue bundles
- **Live Save/Export**: Save changes and download corrected PDFs

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript
- **UI Components**: Radix UI + Tailwind CSS
- **State Management**: TanStack Query
- **PDF Engine**: Nutrient Web SDK + Document Engine
- **Backend**: Express + Node.js
- **Authentication**: JWT (RS256) for Document Engine

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- (Optional) Nutrient Document Engine instance

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server port (defaults to 5000)
PORT=5000

# Document Engine Configuration (optional - for server-backed mode)
DOC_ENGINE_URL=https://your-document-engine.example.com/
DOC_ENGINE_API_TOKEN=your_document_engine_api_token

# JWT Configuration (required for Document Engine mode)
# See "Generating RSA Keys" section below
JWT_PRIVATE_KEY_PEM="-----BEGIN RSA PRIVATE KEY-----
...your private key here...
-----END RSA PRIVATE KEY-----"
JWT_EXPIRES_IN_SECONDS=3600
JWT_PERMISSIONS=read-document,write,download

# Public URL for this backend (for Document Engine to fetch PDFs)
PUBLIC_BASE_URL=https://your-replit-app.replit.app

# Frontend configuration
VITE_API_BASE_URL=
```

### Generating RSA Keys

For Document Engine JWT authentication, generate an RSA key pair:

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Generate public key (provide to Document Engine)
openssl rsa -in private.pem -pubout -out public.pem

# View private key content (copy to JWT_PRIVATE_KEY_PEM)
cat private.pem
```

The public key (`public.pem`) should be configured in your Nutrient Document Engine instance.

### Running the Application

**Development Mode:**

```bash
npm run dev
```

The application will start on `http://localhost:5000`

**Production Build:**

```bash
npm run build
npm start
```

## API Endpoints

### Health Check
```
GET /api/health
Response: { ok: true }
```

### List Claims
```
GET /api/claims
Response: [{ claimId, documents: [{ documentId, title }] }]
```

### Get Documents for Claim
```
GET /api/claims/:claimId/documents
Response: [{ documentId, name, claimId }]
```

### Upload Document with Issues
```
POST /api/claims/:claimId/documents
Content-Type: multipart/form-data
Fields:
  - file: PDF file (required, max 25MB)
  - issues: JSON string or issues.json file (optional)
Response: { claimId, documentId }
```

### Get Session for Document
```
GET /api/session/:documentId
Response: {
  documentId,
  jwt,           // JWT token for Document Engine
  serverUrl,     // Document Engine URL
  instant,       // "true" for instant mode
  autoSaveMode,  // "INTELLIGENT" | "DISABLED"
  exp            // JWT expiration timestamp
}
```

### Get Issues for Document
```
GET /api/claims/:claimId/documents/:documentId/issues
Response: Issue Bundle JSON
```

### Public File Access (for Document Engine)
```
GET /files/:documentId.pdf
Response: PDF file (no authentication required)
```

### Audit Logging
```
POST /api/audit
Body: { claimId, documentId, issueId, action, method, before, after, user, ts }
Response: { success: true }

GET /api/audit?documentId=...
Response: Array of recent audit events
```

## Usage Guide

### 1. Load a Document

1. Select a **Claim** from the dropdown
2. Select a **Document** from the available documents
3. Enter your **User ID** for audit logging
4. Click **Load Document**

### 2. Review Issues

The left sidebar displays all detected issues with:
- **Status badge**: Open, Applied, Manual, Rejected
- **Severity level**: Critical, High, Medium, Low
- **Confidence score**: Detection confidence percentage
- **Found vs Expected values**: What was detected vs what should be

### 3. Correct Issues

For each issue, you have three options:

**Apply Suggested Fix** (Auto mode):
- Attempts automatic correction using multiple strategies
- Falls back through: form field → content editing → redaction overlay
- Requires confirmation for safety

**Manual Edit**:
- Opens the document in edit mode
- Use Nutrient's built-in editing tools
- Marks issue as "Manual" status

**Reject**:
- Mark the issue as a false positive
- Removes from active correction queue

### 4. Save & Export

- **Save**: Persist changes to the document
- **Download PDF**: Export the corrected document locally

## Issue Correction Strategies

The **FixEngine** implements three fallback strategies:

### 1. Form Field Correction
- Detects form fields by name
- Updates field values programmatically
- Best for: structured forms with named fields

### 2. Content Editing
- Begins content editing session
- Finds overlapping text blocks
- Replaces found value with expected value
- Best for: text content corrections

### 3. Redaction Overlay
- Creates redaction annotation
- Overlays expected value
- Requires user confirmation before applying
- Best for: visual replacements

## Data Models

### Issue Object

```typescript
{
  issueId: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number; // 0-1
  pageIndex: number;
  rect: { left, top, width, height };
  foundValue?: string;
  expectedValue?: string;
  formFieldName?: string;
  suggestedFix: {
    strategy: "auto" | "manual";
    requiresApproval: boolean;
    fallbackOrder: Array<"form_field" | "content_edit" | "redaction_overlay">;
  };
}
```

## File Structure

```
├── client/
│   └── src/
│       ├── components/ui/    # Reusable UI components
│       ├── hooks/            # Custom React hooks
│       ├── lib/              # Utilities (API, FixEngine)
│       └── pages/            # Page components
├── server/
│   ├── index.ts              # Express server setup
│   ├── routes.ts             # API route handlers
│   └── storage.ts            # Data storage interface
├── shared/
│   └── schema.ts             # Shared type definitions
├── data/
│   ├── index.json            # Claims/documents index
│   └── audit.log             # Audit log (JSONL format)
└── storage/                  # PDF and issue bundle storage
```

## Development

**Type Checking:**

```bash
npm run check
```

**Build:**

```bash
npm run build
```

## Document Engine Integration

When Document Engine is configured:

1. **Upload Flow**:
   - PDF uploaded to `/storage/<documentId>.pdf`
   - Backend registers document with Document Engine via API
   - Document Engine fetches PDF from `/files/<documentId>.pdf`

2. **Session Flow**:
   - Frontend requests session for document
   - Backend generates JWT with document permissions
   - Frontend loads Nutrient viewer with JWT credentials

3. **Save Flow**:
   - Autosave mode syncs changes to Document Engine
   - Or manual save via `instance.save()`

## License

MIT

---

Built with ❤️ using Replit
