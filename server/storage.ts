import { type User, type InsertUser, type Claim, type Document, type IssueBundle, type AuditLog } from "@shared/schema";
import { randomUUID } from "crypto";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getClaims(userId?: string): Promise<Claim[]>;
  getClaimById(claimId: string): Promise<Claim | null>;
  createClaim(claim: Partial<Claim> & { claimId: string }, userId?: string): Promise<Claim>;
  updateClaim(claimId: string, updates: Partial<Claim>): Promise<Claim | null>;
  getDocumentsByClaim(claimId: string): Promise<Document[]>;
  getDocument(documentId: string): Promise<Document | null>;
  createDocument(doc: { documentId: string; claimId: string; title: string; filePath: string; fileSize?: number }, userId?: string): Promise<Document>;
  getIssues(claimId: string, documentId: string): Promise<IssueBundle>;
  getIssuesByDocument(documentId: string): Promise<any[]>;
  saveIssues(claimId: string, documentId: string, issues: IssueBundle, userId?: string): Promise<void>;
  updateIssueStatus(issueId: string, status: string): Promise<void>;
  logAudit(audit: AuditLog, userId?: string): Promise<void>;
  getAuditLogs(documentId?: string): Promise<AuditLog[]>;
  documentExists(documentId: string, claimId?: string): Promise<boolean>;
  claimExists(claimId: string): Promise<boolean>;
  getClaimForDocument(documentId: string): Promise<string | null>;
}

export class SupabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    if (!supabaseAdmin) return undefined;
    
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
    if (error || !data.user) return undefined;
    
    return {
      id: data.user.id,
      username: data.user.email || '',
      password: '',
    };
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!supabaseAdmin) return undefined;
    
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return undefined;
    
    const user = data.users.find(u => u.email === username);
    if (!user) return undefined;
    
    return {
      id: user.id,
      username: user.email || '',
      password: '',
    };
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!supabaseAdmin) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: insertUser.username,
      password: insertUser.password,
      email_confirm: true,
    });
    
    if (error) throw error;
    
    return {
      id: data.user.id,
      username: data.user.email || '',
      password: '',
    };
  }

  async getClaims(userId?: string): Promise<Claim[]> {
    if (!supabaseAdmin) return [];
    
    let query = supabaseAdmin.from('claims').select('*');
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching claims:', error);
      return [];
    }
    
    return (data || []).map(row => ({
      claimId: row.claim_id,
      claimNumber: row.claim_number,
      policyNumber: row.policy_number,
      status: row.status,
      insuredName: row.insured_name,
      dateOfLoss: row.date_of_loss,
      claimAmount: row.claim_amount,
      adjusterName: row.adjuster_name,
    }));
  }

  async getClaimById(claimId: string): Promise<Claim | null> {
    if (!supabaseAdmin) return null;
    
    const { data, error } = await supabaseAdmin
      .from('claims')
      .select('*')
      .eq('claim_id', claimId)
      .single();
    
    if (error || !data) return null;
    
    return {
      claimId: data.claim_id,
      claimNumber: data.claim_number,
      policyNumber: data.policy_number,
      status: data.status,
      insuredName: data.insured_name,
      dateOfLoss: data.date_of_loss,
      claimAmount: data.claim_amount,
      adjusterName: data.adjuster_name,
    };
  }

  async createClaim(claim: Partial<Claim> & { claimId: string }, userId?: string): Promise<Claim> {
    if (!supabaseAdmin) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabaseAdmin
      .from('claims')
      .insert({
        claim_id: claim.claimId,
        claim_number: claim.claimNumber || claim.claimId,
        policy_number: claim.policyNumber,
        status: claim.status || 'open',
        insured_name: claim.insuredName,
        date_of_loss: claim.dateOfLoss,
        claim_amount: claim.claimAmount,
        adjuster_name: claim.adjusterName,
        user_id: userId,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      claimId: data.claim_id,
      claimNumber: data.claim_number,
      policyNumber: data.policy_number,
      status: data.status,
    };
  }

  async updateClaim(claimId: string, updates: Partial<Claim>): Promise<Claim | null> {
    if (!supabaseAdmin) return null;
    
    const updateData: any = {};
    if (updates.claimNumber !== undefined) updateData.claim_number = updates.claimNumber;
    if (updates.policyNumber !== undefined) updateData.policy_number = updates.policyNumber;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.insuredName !== undefined) updateData.insured_name = updates.insuredName;
    if (updates.dateOfLoss !== undefined) updateData.date_of_loss = updates.dateOfLoss;
    if (updates.claimAmount !== undefined) updateData.claim_amount = updates.claimAmount;
    if (updates.adjusterName !== undefined) updateData.adjuster_name = updates.adjusterName;
    
    const { data, error } = await supabaseAdmin
      .from('claims')
      .update(updateData)
      .eq('claim_id', claimId)
      .select()
      .single();
    
    if (error || !data) return null;
    
    return {
      claimId: data.claim_id,
      claimNumber: data.claim_number,
      policyNumber: data.policy_number,
      status: data.status,
    };
  }

  async getDocumentsByClaim(claimId: string): Promise<Document[]> {
    if (!supabaseAdmin) return [];
    
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching documents:', error);
      return [];
    }
    
    return (data || []).map(row => ({
      documentId: row.document_id,
      name: row.title,
      claimId: row.claim_id,
    }));
  }

  async getDocument(documentId: string): Promise<Document | null> {
    if (!supabaseAdmin) return null;
    
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('document_id', documentId)
      .single();
    
    if (error || !data) return null;
    
    return {
      documentId: data.document_id,
      name: data.title,
      claimId: data.claim_id,
    };
  }

  async createDocument(doc: { documentId: string; claimId: string; title: string; filePath: string; fileSize?: number }, userId?: string): Promise<Document> {
    if (!supabaseAdmin) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabaseAdmin
      .from('documents')
      .insert({
        document_id: doc.documentId,
        claim_id: doc.claimId,
        title: doc.title,
        file_path: doc.filePath,
        file_size: doc.fileSize,
        user_id: userId,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      documentId: data.document_id,
      name: data.title,
      claimId: data.claim_id,
    };
  }

  async getIssues(claimId: string, documentId: string): Promise<IssueBundle> {
    if (!supabaseAdmin) {
      return {
        schemaVersion: "1.0",
        claimId,
        document: { documentId, fingerprint: `fp-${documentId}` },
        issues: [],
      };
    }
    
    const { data, error } = await supabaseAdmin
      .from('issues')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching issues:', error);
      return {
        schemaVersion: "1.0",
        claimId,
        document: { documentId, fingerprint: `fp-${documentId}` },
        issues: [],
      };
    }
    
    const issues = (data || []).map(row => ({
      issueId: row.issue_id,
      type: row.type,
      severity: row.severity,
      confidence: parseFloat(row.confidence),
      pageIndex: row.page_index,
      rect: row.rect,
      foundValue: row.found_value,
      expectedValue: row.expected_value,
      formFieldName: row.form_field_name,
      label: row.label,
      suggestedFix: row.suggested_fix,
      status: row.status,
    }));
    
    return {
      schemaVersion: "1.0",
      claimId,
      document: { documentId, fingerprint: `fp-${documentId}` },
      issues,
    };
  }

  async getIssuesByDocument(documentId: string): Promise<any[]> {
    if (!supabaseAdmin) return [];
    
    const { data, error } = await supabaseAdmin
      .from('issues')
      .select('*')
      .eq('document_id', documentId);
    
    if (error) return [];
    return data || [];
  }

  async saveIssues(claimId: string, documentId: string, issueBundle: IssueBundle, userId?: string): Promise<void> {
    if (!supabaseAdmin) return;
    
    for (const issue of issueBundle.issues) {
      const { error } = await supabaseAdmin
        .from('issues')
        .upsert({
          issue_id: issue.issueId,
          document_id: documentId,
          type: issue.type,
          severity: issue.severity,
          confidence: issue.confidence,
          page_index: issue.pageIndex,
          rect: issue.rect,
          found_value: issue.foundValue,
          expected_value: issue.expectedValue,
          form_field_name: issue.formFieldName,
          label: issue.label,
          suggested_fix: issue.suggestedFix,
          status: issue.status || 'OPEN',
          user_id: userId,
        }, { onConflict: 'issue_id' });
      
      if (error) {
        console.error('Error saving issue:', error);
      }
    }
  }

  async updateIssueStatus(issueId: string, status: string): Promise<void> {
    if (!supabaseAdmin) return;
    
    const { error } = await supabaseAdmin
      .from('issues')
      .update({ status })
      .eq('issue_id', issueId);
    
    if (error) {
      console.error('Error updating issue status:', error);
    }
  }

  async logAudit(audit: AuditLog, userId?: string): Promise<void> {
    if (!supabaseAdmin) {
      console.log('[AUDIT]', audit);
      return;
    }
    
    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        claim_id: audit.claimId,
        document_id: audit.documentId,
        issue_id: audit.issueId,
        action: audit.action,
        method: audit.method,
        before_value: audit.beforeValue,
        after_value: audit.afterValue,
        user_id: userId || audit.userId,
      });
    
    if (error) {
      console.error('Error logging audit:', error);
    }
  }

  async getAuditLogs(documentId?: string): Promise<AuditLog[]> {
    if (!supabaseAdmin) return [];
    
    let query = supabaseAdmin.from('audit_logs').select('*');
    
    if (documentId) {
      query = query.eq('document_id', documentId);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    
    if (error) return [];
    
    return (data || []).map(row => ({
      claimId: row.claim_id,
      documentId: row.document_id,
      issueId: row.issue_id,
      action: row.action,
      method: row.method,
      beforeValue: row.before_value,
      afterValue: row.after_value,
      userId: row.user_id,
      timestamp: row.created_at,
    }));
  }

  async documentExists(documentId: string, claimId?: string): Promise<boolean> {
    if (!supabaseAdmin) return false;
    
    let query = supabaseAdmin
      .from('documents')
      .select('document_id')
      .eq('document_id', documentId);
    
    if (claimId) {
      query = query.eq('claim_id', claimId);
    }
    
    const { data, error } = await query.single();
    
    return !error && !!data;
  }

  async claimExists(claimId: string): Promise<boolean> {
    if (!supabaseAdmin) return false;
    
    const { data, error } = await supabaseAdmin
      .from('claims')
      .select('claim_id')
      .eq('claim_id', claimId)
      .single();
    
    return !error && !!data;
  }

  async getClaimForDocument(documentId: string): Promise<string | null> {
    if (!supabaseAdmin) return null;
    
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('claim_id')
      .eq('document_id', documentId)
      .single();
    
    if (error || !data) return null;
    return data.claim_id;
  }
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private claims: Map<string, Claim>;
  private documents: Map<string, Document & { filePath?: string }>;
  private issues: Map<string, IssueBundle>;
  private auditLogs: AuditLog[] = [];

  constructor() {
    this.users = new Map();
    this.claims = new Map();
    this.documents = new Map();
    this.issues = new Map();
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

  async getClaims(userId?: string): Promise<Claim[]> {
    return Array.from(this.claims.values());
  }

  async getClaimById(claimId: string): Promise<Claim | null> {
    return this.claims.get(claimId) || null;
  }

  async createClaim(claim: Partial<Claim> & { claimId: string }, userId?: string): Promise<Claim> {
    const newClaim: Claim = {
      claimId: claim.claimId,
      claimNumber: claim.claimNumber || claim.claimId,
      policyNumber: claim.policyNumber,
      status: claim.status || 'open',
    };
    this.claims.set(claim.claimId, newClaim);
    return newClaim;
  }

  async updateClaim(claimId: string, updates: Partial<Claim>): Promise<Claim | null> {
    const claim = this.claims.get(claimId);
    if (!claim) return null;
    
    const updated = { ...claim, ...updates };
    this.claims.set(claimId, updated);
    return updated;
  }

  async getDocumentsByClaim(claimId: string): Promise<Document[]> {
    return Array.from(this.documents.values()).filter(d => d.claimId === claimId);
  }

  async getDocument(documentId: string): Promise<Document | null> {
    return this.documents.get(documentId) || null;
  }

  async createDocument(doc: { documentId: string; claimId: string; title: string; filePath: string; fileSize?: number }, userId?: string): Promise<Document> {
    const newDoc: Document & { filePath?: string } = {
      documentId: doc.documentId,
      name: doc.title,
      claimId: doc.claimId,
      filePath: doc.filePath,
    };
    this.documents.set(doc.documentId, newDoc);
    return newDoc;
  }

  async getIssues(claimId: string, documentId: string): Promise<IssueBundle> {
    const key = `${claimId}__${documentId}`;
    return this.issues.get(key) || {
      schemaVersion: "1.0",
      claimId,
      document: { documentId, fingerprint: `fp-${documentId}` },
      issues: [],
    };
  }

  async getIssuesByDocument(documentId: string): Promise<any[]> {
    const entries = Array.from(this.issues.entries());
    for (const [key, bundle] of entries) {
      if (key.includes(documentId)) {
        return bundle.issues;
      }
    }
    return [];
  }

  async saveIssues(claimId: string, documentId: string, issueBundle: IssueBundle, userId?: string): Promise<void> {
    const key = `${claimId}__${documentId}`;
    this.issues.set(key, issueBundle);
  }

  async updateIssueStatus(issueId: string, status: string): Promise<void> {
    const bundles = Array.from(this.issues.values());
    for (const bundle of bundles) {
      const issue = bundle.issues.find((i: any) => i.issueId === issueId);
      if (issue) {
        (issue as any).status = status;
        break;
      }
    }
  }

  async logAudit(audit: AuditLog, userId?: string): Promise<void> {
    this.auditLogs.push(audit);
    console.log("[AUDIT]", audit);
  }

  async getAuditLogs(documentId?: string): Promise<AuditLog[]> {
    if (documentId) {
      return this.auditLogs.filter(a => a.documentId === documentId);
    }
    return this.auditLogs.slice(-100);
  }

  async documentExists(documentId: string, claimId?: string): Promise<boolean> {
    const doc = this.documents.get(documentId);
    if (!doc) return false;
    if (claimId && doc.claimId !== claimId) return false;
    return true;
  }

  async claimExists(claimId: string): Promise<boolean> {
    return this.claims.has(claimId);
  }

  async getClaimForDocument(documentId: string): Promise<string | null> {
    const doc = this.documents.get(documentId);
    return doc?.claimId || null;
  }
}

export const storage: IStorage = isSupabaseConfigured() 
  ? new SupabaseStorage() 
  : new MemStorage();
