# Developer Guidelines — Claims File Correction Workbench

This document defines the engineering and architectural rules for this repository.

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
