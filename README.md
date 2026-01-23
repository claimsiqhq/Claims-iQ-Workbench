# Claims File Correction Workbench

A professional "Human-in-the-loop" document processing interface that integrates with Nutrient Web SDK for PDF review and issue correction.

## Features

- **PDF Document Viewer**: Load and view PDF documents using Nutrient Web SDK
- **Issue Detection & Visualization**: Automatically highlight detected issues with color-coded severity levels
- **Smart Correction Workflows**:
  - **Auto-Apply**: Automatic corrections with fallback strategies (form fields → content editing → redaction overlay)
  - **Manual Edit**: Use Nutrient viewer tools for manual corrections
  - **Reject**: Mark issues as false positives
- **Issue Management**: Filter issues by status (All, Open, Applied, Rejected)
- **Audit Logging**: Complete audit trail of all correction actions
- **Live Save/Export**: Save changes and download corrected PDFs

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript
- **UI Components**: Radix UI + Tailwind CSS
- **State Management**: TanStack Query
- **PDF Engine**: Nutrient Web SDK (Document Engine mode)
- **Backend**: Express + Node.js

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Optional: Backend API base URL (defaults to same origin)
VITE_API_BASE_URL=http://localhost:5000

# Optional: Nutrient SDK license key (for production)
# VITE_NUTRIENT_LICENSE_KEY=your_license_key_here
```

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

### 4. Navigate & Filter

- **Click an issue** to navigate to its location in the PDF
- **Use filters** to view: All, Open, Applied, or Rejected issues
- **Status updates** happen in real-time

### 5. Save & Export

- **Save**: Persist changes to the document (if autosave is disabled)
- **Download PDF**: Export the corrected document locally

## API Endpoints

The backend provides the following REST endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/claims` | GET | List all claims |
| `/api/claims/:claimId/documents` | GET | Get documents for a claim |
| `/api/session/:documentId` | GET | Get Nutrient session data |
| `/api/claims/:claimId/documents/:documentId/issues` | GET | Get issue bundle |
| `/api/audit` | POST | Log audit events |

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

## Integrating with a Backend

To connect to a real backend (instead of demo data):

1. Set `VITE_API_BASE_URL` to your backend URL
2. Implement the API endpoints listed above
3. For Document Engine mode, provide:
   - `serverUrl`: Your Nutrient Document Engine URL
   - `jwt`: Authentication token
   - `documentId`: Unique document identifier

## Development

**Type Checking:**

```bash
npm run check
```

**Build:**

```bash
npm run build
```

## Architecture

```
client/
  ├── src/
  │   ├── components/ui/    # Reusable UI components
  │   ├── hooks/            # Custom React hooks
  │   ├── lib/              # Utilities (API, FixEngine)
  │   └── pages/            # Page components
server/
  ├── routes.ts             # API route handlers
  └── storage.ts            # Data storage interface
shared/
  └── schema.ts             # Shared type definitions
```

## License

MIT

---

Built with ❤️ using Replit
