import { type User, type InsertUser, type Claim, type Document, type IssueBundle, type AuditLog } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getClaims(): Promise<Claim[]>;
  getDocumentsByClaim(claimId: string): Promise<Document[]>;
  getIssues(claimId: string, documentId: string): Promise<IssueBundle>;
  logAudit(audit: AuditLog): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private auditLogs: AuditLog[] = [];

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getClaims(): Promise<Claim[]> {
    return [
      {
        claimId: "CLM-2024-001",
        claimNumber: "CLM-2024-001",
        policyNumber: "POL-98765",
        status: "Under Review",
      },
      {
        claimId: "CLM-2024-002",
        claimNumber: "CLM-2024-002",
        policyNumber: "POL-12345",
        status: "Pending Correction",
      },
    ];
  }

  async getDocumentsByClaim(claimId: string): Promise<Document[]> {
    return [
      {
        documentId: "DOC-001",
        name: "Insurance Application Form.pdf",
        claimId,
      },
      {
        documentId: "DOC-002",
        name: "Medical Records.pdf",
        claimId,
      },
    ];
  }

  async getIssues(claimId: string, documentId: string): Promise<IssueBundle> {
    return {
      schemaVersion: "1.0",
      claimId,
      document: {
        documentId,
        fingerprint: `fp-${documentId}`,
      },
      issues: [
        {
          issueId: "ISS-001",
          type: "policy_number_mismatch",
          severity: "critical",
          confidence: 0.95,
          pageIndex: 0,
          rect: { left: 100, top: 150, width: 200, height: 30 },
          foundValue: "POL-98764",
          expectedValue: "POL-98765",
          formFieldName: "policyNumber",
          label: "Policy Number",
          suggestedFix: {
            strategy: "auto",
            requiresApproval: true,
            fallbackOrder: ["form_field", "content_edit", "redaction_overlay"],
          },
        },
        {
          issueId: "ISS-002",
          type: "date_format_invalid",
          severity: "high",
          confidence: 0.88,
          pageIndex: 0,
          rect: { left: 100, top: 250, width: 150, height: 25 },
          foundValue: "01/15/24",
          expectedValue: "2024-01-15",
          formFieldName: "effectiveDate",
          label: "Effective Date",
          suggestedFix: {
            strategy: "auto",
            requiresApproval: true,
            fallbackOrder: ["form_field", "content_edit", "redaction_overlay"],
          },
        },
        {
          issueId: "ISS-003",
          type: "missing_signature",
          severity: "critical",
          confidence: 0.92,
          pageIndex: 1,
          rect: { left: 400, top: 600, width: 180, height: 40 },
          label: "Applicant Signature",
          suggestedFix: {
            strategy: "manual",
            requiresApproval: false,
            fallbackOrder: [],
          },
        },
        {
          issueId: "ISS-004",
          type: "address_incomplete",
          severity: "medium",
          confidence: 0.75,
          pageIndex: 0,
          rect: { left: 100, top: 350, width: 250, height: 60 },
          foundValue: "123 Main St",
          expectedValue: "123 Main St, Apt 4B, Springfield, IL 62701",
          formFieldName: "mailingAddress",
          label: "Mailing Address",
          suggestedFix: {
            strategy: "auto",
            requiresApproval: true,
            fallbackOrder: ["form_field", "content_edit", "redaction_overlay"],
          },
        },
      ],
    };
  }

  async logAudit(audit: AuditLog): Promise<void> {
    this.auditLogs.push(audit);
    console.log("[AUDIT]", audit);
  }
}

export const storage = new MemStorage();
