import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, jsonb, date, boolean, numeric, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  claimId: text("claim_id").notNull().unique(),
  claimNumber: text("claim_number"),
  policyNumber: text("policy_number"),
  insuredName: text("insured_name"),
  dateOfLoss: date("date_of_loss"),
  claimAmount: text("claim_amount"),
  status: text("status").default("open"),
  adjusterName: text("adjuster_name"),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  documentId: text("document_id").notNull().unique(),
  claimId: text("claim_id").notNull().references(() => claims.claimId, { onDelete: "cascade" }),
  title: text("title").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type").default("application/pdf"),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const issues = pgTable("issues", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  issueId: text("issue_id").notNull().unique(),
  documentId: text("document_id").notNull().references(() => documents.documentId, { onDelete: "cascade" }),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  pageIndex: integer("page_index").notNull().default(0),
  rect: jsonb("rect"),
  foundValue: text("found_value"),
  expectedValue: text("expected_value"),
  formFieldName: text("form_field_name"),
  label: text("label"),
  suggestedFix: jsonb("suggested_fix"),
  status: text("status").notNull().default("OPEN"),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  claimId: text("claim_id").notNull(),
  documentId: text("document_id").notNull(),
  issueId: text("issue_id").notNull(),
  action: text("action").notNull(),
  method: text("method"),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const corrections = pgTable("corrections", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  claimId: text("claim_id").notNull().references(() => claims.claimId, { onDelete: "cascade" }),
  documentId: text("document_id").notNull().references(() => documents.documentId, { onDelete: "cascade" }),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  location: jsonb("location").notNull(),
  foundValue: text("found_value").notNull(),
  expectedValue: text("expected_value").notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  requiresHumanReview: boolean("requires_human_review").default(true),
  recommendedAction: text("recommended_action"),
  evidence: jsonb("evidence"),
  formFieldName: text("form_field_name"),
  status: text("status").default("pending"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  appliedBy: uuid("applied_by"),
  appliedMethod: text("applied_method"),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const annotations = pgTable("annotations", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  documentId: text("document_id").notNull().references(() => documents.documentId, { onDelete: "cascade" }),
  type: text("type").notNull(),
  location: jsonb("location").notNull(),
  text: text("text"),
  color: text("color"),
  relatedCorrectionId: uuid("related_correction_id"),
  relatedValidationId: uuid("related_validation_id"),
  createdBy: uuid("created_by"),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const crossDocumentValidations = pgTable("cross_document_validations", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  claimId: text("claim_id").notNull().references(() => claims.claimId, { onDelete: "cascade" }),
  field: text("field").notNull(),
  severity: text("severity").notNull(),
  documents: jsonb("documents").notNull(),
  expectedValue: text("expected_value"),
  recommendedAction: text("recommended_action"),
  reasoning: text("reasoning"),
  status: text("status").default("pending"),
  resolvedValue: text("resolved_value"),
  resolvedBy: uuid("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  escalationReason: text("escalation_reason"),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
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
  rect: IssueRectSchema.optional(),
  searchText: z.string().optional(), // Text to search for when bbox is not available
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
  dateOfLoss: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
  claimAmount: z.string().optional(),
  adjusterName: z.string().optional(),
  documents: z.array(ClaimDocumentRefSchema).optional(),
});

export const ExtractedClaimInfoSchema = z.object({
  claimId: z.string().optional(),
  claimNumber: z.string().optional(),
  policyNumber: z.string().optional(),
  insuredName: z.string().optional(),
  dateOfLoss: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
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
