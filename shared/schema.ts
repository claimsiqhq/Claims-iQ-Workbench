import { sql } from "drizzle-orm";
import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Claims Workbench Types
export const IssueRectSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});

export const SuggestedFixSchema = z.object({
  strategy: z.enum(["auto", "manual"]),
  requiresApproval: z.boolean(),
  fallbackOrder: z.array(z.enum(["form_field", "content_edit", "redaction_overlay"])),
});

export const IssueSchema = z.object({
  issueId: z.string(),
  type: z.string(),
  severity: z.enum(["critical", "warning", "info"]),
  confidence: z.number().min(0).max(1),
  pageIndex: z.number().min(0),
  rect: IssueRectSchema,
  foundValue: z.string().optional(),
  expectedValue: z.string().optional(),
  formFieldName: z.string().optional(),
  suggestedFix: SuggestedFixSchema,
  label: z.string().optional(),
  status: z.enum(["OPEN", "APPLIED", "MANUAL", "REJECTED"]).optional(),
});

export const IssueBundleSchema = z.object({
  schemaVersion: z.string(),
  claimId: z.string(),
  document: z.object({
    documentId: z.string(),
    fingerprint: z.string(),
  }),
  issues: z.array(IssueSchema),
});

export const DocumentSchema = z.object({
  documentId: z.string(),
  name: z.string(),
  claimId: z.string(),
});

export const ClaimDocumentRefSchema = z.object({
  documentId: z.string(),
  title: z.string(),
});

export const ClaimSchema = z.object({
  claimId: z.string(),
  claimNumber: z.string().optional(),
  policyNumber: z.string().optional(),
  status: z.string().optional(),
  insuredName: z.string().optional(),
  dateOfLoss: z.string().optional(),
  claimAmount: z.string().optional(),
  adjusterName: z.string().optional(),
  documents: z.array(ClaimDocumentRefSchema).optional(),
});

export const ExtractedClaimInfoSchema = z.object({
  claimId: z.string().optional(),
  claimNumber: z.string().optional(),
  policyNumber: z.string().optional(),
  insuredName: z.string().optional(),
  dateOfLoss: z.string().optional(),
  claimAmount: z.string().optional(),
  status: z.string().optional(),
  adjusterName: z.string().optional(),
}).passthrough(); // Allow additional fields

export const SessionDataSchema = z.object({
  documentId: z.string(),
  jwt: z.string().optional(),
  serverUrl: z.string().optional(),
  instant: z.string().optional(),
  autoSaveMode: z.enum(["IMMEDIATE", "INTELLIGENT", "DISABLED"]).optional(),
  exp: z.number().optional(),
});

export const AuditLogSchema = z.object({
  claimId: z.string(),
  documentId: z.string(),
  issueId: z.string(),
  action: z.enum(["applied", "rejected", "manual_edit", "reset", "AUTO_FIX", "MANUAL_FIX", "REJECT"]),
  method: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  beforeValue: z.string().optional(),
  afterValue: z.string().optional(),
  user: z.string().optional(),
  userId: z.string().optional(),
  ts: z.string().optional(),
  timestamp: z.string().optional(),
});

export type Issue = z.infer<typeof IssueSchema>;
export type IssueBundle = z.infer<typeof IssueBundleSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type SessionData = z.infer<typeof SessionDataSchema>;
export type AuditLog = z.infer<typeof AuditLogSchema>;
export type ExtractedClaimInfo = z.infer<typeof ExtractedClaimInfoSchema>;
export type IssueStatus = "OPEN" | "APPLIED" | "MANUAL" | "REJECTED";

// Re-export canonical schemas for convenience
export * from "./schemas";
