import { type User, type InsertUser, type Claim, type Document, type IssueBundle, type AuditLog } from "@shared/schema";
import type { Correction, Annotation, CrossDocumentValidation, DocumentCorrectionPayload } from "@shared/schemas";
import { randomUUID } from "crypto";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { PaginationParams, PaginatedResult } from "@shared/types/pagination";
import { DEFAULT_PAGE, DEFAULT_LIMIT } from "@shared/types/pagination";

const normalizeDateOfLoss = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    return value;
  }
  return undefined;
};

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getClaims(userId?: string): Promise<Claim[]>;
  getClaimsPaginated(userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<Claim>>;
  getClaimById(claimId: string, userId?: string): Promise<Claim | null>;
  createClaim(claim: Partial<Claim> & { claimId: string }, userId?: string): Promise<Claim>;
  updateClaim(claimId: string, updates: Partial<Claim>): Promise<Claim | null>;
  deleteClaim(claimId: string, userId?: string): Promise<void>;
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
  
  // Canonical schema methods
  getCorrections(documentId: string, userId?: string): Promise<Correction[]>;
  getCorrectionsPaginated(documentId: string, userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<Correction>>;
  getCorrectionsByClaimId(claimId: string, userId?: string): Promise<Correction[]>;
  createCorrection(correction: Correction, userId?: string): Promise<Correction>;
  saveCorrection(correction: Correction, userId?: string): Promise<void>;
  updateCorrectionStatus(correctionId: string, status: Correction["status"], appliedBy?: string, method?: string, userId?: string): Promise<void>;
  getAnnotations(documentId: string, userId?: string): Promise<Annotation[]>;
  getAnnotationsPaginated(documentId: string, userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<Annotation>>;
  createAnnotation(annotation: Annotation, documentId: string, userId?: string): Promise<Annotation>;
  saveAnnotation(annotation: Annotation, documentId: string, userId?: string): Promise<void>;
  updateAnnotation(id: string, updates: Partial<Annotation>, userId?: string): Promise<Annotation>;
  deleteAnnotation(annotationId: string, userId?: string): Promise<void>;
  getCrossDocValidations(claimId: string, userId?: string): Promise<CrossDocumentValidation[]>;
  getCrossDocValidationsPaginated(claimId: string, userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<CrossDocumentValidation>>;
  getCrossDocumentValidations(claimId: string, userId?: string): Promise<CrossDocumentValidation[]>;
  createCrossDocValidation(validation: CrossDocumentValidation, userId?: string): Promise<CrossDocumentValidation>;
  saveCrossDocumentValidation(validation: CrossDocumentValidation, userId?: string): Promise<void>;
  resolveCrossDocValidation(id: string, resolvedValue: string, resolvedBy: string): Promise<void>;
  escalateCrossDocValidation(id: string, reason: string): Promise<void>;
  updateCrossDocumentValidationStatus(validationId: string, status: CrossDocumentValidation["status"], resolvedValue?: string, userId?: string): Promise<void>;
  saveCorrectionPayload(payload: DocumentCorrectionPayload, userId?: string): Promise<void>;
}

export class SupabaseStorage implements IStorage {
  private schemaValid: boolean | null = null;
  
  private async checkSchema(): Promise<boolean> {
    if (this.schemaValid !== null) return this.schemaValid;
    if (!supabaseAdmin) return false;
    
    try {
      const { error } = await supabaseAdmin.from('claims').select('claim_id').limit(1);
      this.schemaValid = !error || error.code !== 'PGRST205';
      if (!this.schemaValid) {
        console.error('Supabase schema not found. Please run supabase/schema.sql in your Supabase SQL Editor.');
      }
      return this.schemaValid;
    } catch {
      this.schemaValid = false;
      return false;
    }
  }
  
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
    
    const isRealUser = userId && userId !== 'system' && userId !== 'anonymous';
    
    let query = supabaseAdmin.from('claims').select('*');
    
    if (isRealUser) {
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

  async getClaimsPaginated(userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<Claim>> {
    if (!supabaseAdmin) return { data: [], total: 0 };
    
    const page = pagination?.page || DEFAULT_PAGE;
    const limit = pagination?.limit || DEFAULT_LIMIT;
    const offset = (page - 1) * limit;
    
    const isRealUser = userId && userId !== 'system' && userId !== 'anonymous';
    
    let countQuery = supabaseAdmin.from('claims').select('*', { count: 'exact', head: true });
    let dataQuery = supabaseAdmin.from('claims').select('*');
    
    if (isRealUser) {
      countQuery = countQuery.or(`user_id.eq.${userId},user_id.is.null`);
      dataQuery = dataQuery.or(`user_id.eq.${userId},user_id.is.null`);
    }
    
    const [countResult, dataResult] = await Promise.all([
      countQuery,
      dataQuery
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
    ]);
    
    if (countResult.error) {
      console.error('[storage] Error counting claims:', countResult.error);
    }
    if (dataResult.error) {
      console.error('[storage] Error fetching claims:', dataResult.error);
      return { data: [], total: 0 };
    }
    
    console.log(`[storage] getClaimsPaginated: userId=${userId}, isRealUser=${isRealUser}, count=${countResult.count}, rows=${dataResult.data?.length}`);
    
    const claims = (dataResult.data || []).map(row => ({
      claimId: row.claim_id,
      claimNumber: row.claim_number,
      policyNumber: row.policy_number,
      status: row.status,
      insuredName: row.insured_name,
      dateOfLoss: normalizeDateOfLoss(row.date_of_loss),
      claimAmount: row.claim_amount,
      adjusterName: row.adjuster_name,
    }));
    
    return { data: claims, total: countResult.count || 0 };
  }

  async getClaimById(claimId: string, userId?: string): Promise<Claim | null> {
    if (!supabaseAdmin) return null;
    
    let query = supabaseAdmin
      .from('claims')
      .select('*')
      .eq('claim_id', claimId);
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query.single();
    
    if (error || !data) return null;
    
    return {
      claimId: data.claim_id,
      claimNumber: data.claim_number,
      policyNumber: data.policy_number,
      status: data.status,
      insuredName: data.insured_name,
      dateOfLoss: normalizeDateOfLoss(data.date_of_loss),
      claimAmount: data.claim_amount,
      adjusterName: data.adjuster_name,
    };
  }

  async createClaim(claim: Partial<Claim> & { claimId: string }, userId?: string): Promise<Claim> {
    if (!supabaseAdmin) {
      throw new Error('Supabase not configured');
    }
    
    const isRealUser = userId && userId !== 'system' && userId !== 'anonymous';
    
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
        user_id: isRealUser ? userId : null,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      claimId: data.claim_id,
      claimNumber: data.claim_number,
      policyNumber: data.policy_number,
      status: data.status,
      insuredName: data.insured_name,
      dateOfLoss: normalizeDateOfLoss(data.date_of_loss),
      claimAmount: data.claim_amount,
      adjusterName: data.adjuster_name,
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
      insuredName: data.insured_name,
      dateOfLoss: normalizeDateOfLoss(data.date_of_loss),
      claimAmount: data.claim_amount,
      adjusterName: data.adjuster_name,
    };
  }

  async deleteClaim(claimId: string, userId?: string): Promise<void> {
    if (!supabaseAdmin) return;
    
    let query = supabaseAdmin
      .from('claims')
      .delete()
      .eq('claim_id', claimId);
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { error } = await query;
    if (error) throw error;
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
    
    const isRealUser = userId && userId !== 'system' && userId !== 'anonymous';
    
    const { data, error } = await supabaseAdmin
      .from('documents')
      .insert({
        document_id: doc.documentId,
        claim_id: doc.claimId,
        title: doc.title,
        file_path: doc.filePath,
        file_size: doc.fileSize,
        user_id: isRealUser ? userId : null,
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
    
    const issues = (data || []).map(row => {
      // Ensure rect is properly parsed from JSONB
      // Supabase returns JSONB as an object, but sometimes it might be a string
      let rect = row.rect;
      if (rect === null) {
        rect = undefined;
      }
      if (typeof rect === 'string') {
        try {
          rect = JSON.parse(rect);
        } catch (e) {
          console.error(`Failed to parse rect for issue ${row.issue_id}:`, e);
          rect = undefined;
        }
      }
      
      // Validate rect structure
      if (rect && (typeof rect.left !== 'number' || typeof rect.top !== 'number' || 
          typeof rect.width !== 'number' || typeof rect.height !== 'number')) {
        console.warn(`Issue ${row.issue_id} has invalid rect structure:`, rect);
        rect = undefined;
      }
      
      return {
        issueId: row.issue_id,
        type: row.type,
        severity: row.severity,
        confidence: parseFloat(row.confidence),
        pageIndex: row.page_index,
        rect: rect, // Can be null if missing or invalid
        foundValue: row.found_value,
        expectedValue: row.expected_value,
        formFieldName: row.form_field_name,
        label: row.label,
        suggestedFix: row.suggested_fix || { strategy: "auto", requiresApproval: true, fallbackOrder: ["form_field", "content_edit", "redaction_overlay"] },
        status: row.status,
      };
    });
    
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
    
    const isRealUser = userId && userId !== 'system' && userId !== 'anonymous';

    const payload = issueBundle.issues.map(issue => ({
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
      user_id: isRealUser ? userId : null,
    }));

    const { error } = await supabaseAdmin
      .from('issues')
      .upsert(payload, { onConflict: 'issue_id' });
    
    if (error) {
      console.error('Error saving issues:', error);
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

    const actionMap: Record<string, string> = {
      applied: "AUTO_FIX",
      manual_edit: "MANUAL_FIX",
      rejected: "REJECT",
      reset: "REJECT",
      AUTO_FIX: "AUTO_FIX",
      MANUAL_FIX: "MANUAL_FIX",
      REJECT: "REJECT",
    };
    const dbAction = actionMap[audit.action] || "AUTO_FIX";
    
    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        claim_id: audit.claimId,
        document_id: audit.documentId,
        issue_id: audit.issueId,
        action: dbAction,
        method: audit.method || audit.action || null,
        before_value: audit.beforeValue || audit.before || null,
        after_value: audit.afterValue || audit.after || null,
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

  // Canonical schema methods
  async getCorrections(documentId: string, userId?: string): Promise<Correction[]> {
    if (!supabaseAdmin) return [];
    
    let query = supabaseAdmin
      .from('corrections')
      .select('*')
      .eq('document_id', documentId);
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) return [];
    
    return (data || []).map(row => ({
      id: row.id,
      claim_id: row.claim_id,
      document_id: row.document_id,
      type: row.type as Correction["type"],
      severity: row.severity as Correction["severity"],
      location: row.location,
      found_value: row.found_value || "",
      expected_value: row.expected_value || "",
      confidence: row.confidence,
      requires_human_review: row.requires_human_review,
      recommended_action: row.recommended_action as Correction["recommended_action"],
      evidence: row.evidence,
      form_field_name: row.form_field_name,
      status: row.status as Correction["status"],
      applied_at: row.applied_at,
      applied_by: row.applied_by,
      applied_method: row.applied_method,
    }));
  }

  async getCorrectionsPaginated(documentId: string, userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<Correction>> {
    if (!supabaseAdmin) return { data: [], total: 0 };
    
    const page = pagination?.page || DEFAULT_PAGE;
    const limit = pagination?.limit || DEFAULT_LIMIT;
    const offset = (page - 1) * limit;
    
    let countQuery = supabaseAdmin.from('corrections').select('*', { count: 'exact', head: true }).eq('document_id', documentId);
    let dataQuery = supabaseAdmin.from('corrections').select('*').eq('document_id', documentId);
    
    if (userId) {
      countQuery = countQuery.eq('user_id', userId);
      dataQuery = dataQuery.eq('user_id', userId);
    }
    
    const [countResult, dataResult] = await Promise.all([
      countQuery,
      dataQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    ]);
    
    if (dataResult.error) return { data: [], total: 0 };
    
    const corrections = (dataResult.data || []).map(row => ({
      id: row.id,
      claim_id: row.claim_id,
      document_id: row.document_id,
      type: row.type as Correction["type"],
      severity: row.severity as Correction["severity"],
      location: row.location,
      found_value: row.found_value || "",
      expected_value: row.expected_value || "",
      confidence: row.confidence,
      requires_human_review: row.requires_human_review,
      recommended_action: row.recommended_action as Correction["recommended_action"],
      evidence: row.evidence,
      form_field_name: row.form_field_name,
      status: row.status as Correction["status"],
      applied_at: row.applied_at,
      applied_by: row.applied_by,
      applied_method: row.applied_method,
    }));
    
    return { data: corrections, total: countResult.count || 0 };
  }

  async getCorrectionsByClaimId(claimId: string, userId?: string): Promise<Correction[]> {
    if (!supabaseAdmin) return [];
    
    let query = supabaseAdmin
      .from('corrections')
      .select('*')
      .eq('claim_id', claimId);
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) return [];
    
    return (data || []).map(row => ({
      id: row.id,
      claim_id: row.claim_id,
      document_id: row.document_id,
      type: row.type as Correction["type"],
      severity: row.severity as Correction["severity"],
      location: row.location,
      found_value: row.found_value || "",
      expected_value: row.expected_value || "",
      confidence: row.confidence,
      requires_human_review: row.requires_human_review,
      recommended_action: row.recommended_action as Correction["recommended_action"],
      evidence: row.evidence,
      form_field_name: row.form_field_name,
      status: row.status as Correction["status"],
      applied_at: row.applied_at,
      applied_by: row.applied_by,
      applied_method: row.applied_method,
    }));
  }

  async createCorrection(correction: Correction, userId?: string): Promise<Correction> {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    
    // Use claim_id from correction, or derive from document_id
    let claimId = correction.claim_id;
    if (!claimId && correction.document_id) {
      const doc = await this.getDocument(correction.document_id);
      claimId = doc?.claimId || "";
    }
    if (!claimId && correction.evidence.source_document) {
      const doc = await this.getDocument(correction.evidence.source_document);
      claimId = doc?.claimId || "";
    }
    if (!claimId) {
      throw new Error("Missing claim_id for correction");
    }
    
    const documentId = correction.document_id || correction.evidence.source_document || "";
    
    const { data, error } = await supabaseAdmin.from('corrections').insert({
      id: correction.id,
      document_id: documentId,
      claim_id: claimId,
      type: correction.type,
      severity: correction.severity,
      location: correction.location,
      found_value: correction.found_value,
      expected_value: correction.expected_value,
      confidence: correction.confidence,
      requires_human_review: correction.requires_human_review,
      recommended_action: correction.recommended_action,
      evidence: correction.evidence,
      form_field_name: correction.form_field_name,
      status: correction.status,
      applied_at: correction.applied_at,
      applied_by: correction.applied_by,
      applied_method: correction.applied_method,
      user_id: userId,
    }).select().single();
    
    if (error) throw error;
    
    return {
      id: data.id,
      claim_id: data.claim_id,
      document_id: data.document_id,
      type: data.type as Correction["type"],
      severity: data.severity as Correction["severity"],
      location: data.location,
      found_value: data.found_value || "",
      expected_value: data.expected_value || "",
      confidence: data.confidence,
      requires_human_review: data.requires_human_review,
      recommended_action: data.recommended_action as Correction["recommended_action"],
      evidence: data.evidence,
      form_field_name: data.form_field_name,
      status: data.status as Correction["status"],
      applied_at: data.applied_at,
      applied_by: data.applied_by,
      applied_method: data.applied_method,
    };
  }

  async saveCorrection(correction: Correction, userId?: string): Promise<void> {
    if (!supabaseAdmin) return;
    
    const documentId = correction.document_id || correction.evidence.source_document || "";
    let claimId = correction.claim_id || "";
    if (!claimId && documentId) {
      const doc = await this.getDocument(documentId);
      claimId = doc?.claimId || "";
    }
    if (!claimId) {
      throw new Error("Missing claim_id for correction");
    }
    const { error } = await supabaseAdmin.from('corrections').upsert({
      id: correction.id,
      document_id: documentId,
      claim_id: claimId,
      type: correction.type,
      severity: correction.severity,
      location: correction.location,
      found_value: correction.found_value,
      expected_value: correction.expected_value,
      confidence: correction.confidence,
      requires_human_review: correction.requires_human_review,
      recommended_action: correction.recommended_action,
      evidence: correction.evidence,
      form_field_name: correction.form_field_name,
      status: correction.status,
      applied_at: correction.applied_at,
      applied_by: correction.applied_by,
      applied_method: correction.applied_method,
      user_id: userId,
    });
    
    if (error) {
      console.error('Error saving correction:', error);
      throw error;
    }
  }

  async updateCorrectionStatus(
    correctionId: string,
    status: Correction["status"],
    appliedBy?: string,
    method?: string,
    userId?: string
  ): Promise<void> {
    if (!supabaseAdmin) return;
    
    const update: any = { status };
    if (status === "applied") {
      update.applied_at = new Date().toISOString();
      update.applied_by = appliedBy || userId;
      if (method) {
        update.applied_method = method;
      }
    }
    
    const { error } = await supabaseAdmin
      .from('corrections')
      .update(update)
      .eq('id', correctionId);
    
    if (error) throw error;
  }

  async getAnnotations(documentId: string, userId?: string): Promise<Annotation[]> {
    if (!supabaseAdmin) return [];
    
    let query = supabaseAdmin
      .from('annotations')
      .select('*')
      .eq('document_id', documentId);
    
    if (userId) {
      query = query.eq('created_by', userId);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) return [];
    
    return (data || []).map(row => ({
      id: row.id,
      type: row.type as Annotation["type"],
      location: row.location,
      text: row.text,
      color: row.color,
      related_correction_id: row.related_correction_id,
      related_validation_id: row.related_validation_id,
      created_by: row.created_by,
      created_at: row.created_at,
    }));
  }

  async getAnnotationsPaginated(documentId: string, userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<Annotation>> {
    if (!supabaseAdmin) return { data: [], total: 0 };
    
    const page = pagination?.page || DEFAULT_PAGE;
    const limit = pagination?.limit || DEFAULT_LIMIT;
    const offset = (page - 1) * limit;
    
    let countQuery = supabaseAdmin.from('annotations').select('*', { count: 'exact', head: true }).eq('document_id', documentId);
    let dataQuery = supabaseAdmin.from('annotations').select('*').eq('document_id', documentId);
    
    if (userId) {
      countQuery = countQuery.eq('created_by', userId);
      dataQuery = dataQuery.eq('created_by', userId);
    }
    
    const [countResult, dataResult] = await Promise.all([
      countQuery,
      dataQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    ]);
    
    if (dataResult.error) return { data: [], total: 0 };
    
    const annotations = (dataResult.data || []).map(row => ({
      id: row.id,
      type: row.type as Annotation["type"],
      location: row.location,
      text: row.text,
      color: row.color,
      related_correction_id: row.related_correction_id,
      related_validation_id: row.related_validation_id,
      created_by: row.created_by,
      created_at: row.created_at,
    }));
    
    return { data: annotations, total: countResult.count || 0 };
  }

  async createAnnotation(annotation: Annotation, documentId: string, userId?: string): Promise<Annotation> {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    
    const { data, error } = await supabaseAdmin.from('annotations').insert({
      id: annotation.id,
      document_id: documentId,
      type: annotation.type,
      location: annotation.location,
      text: annotation.text,
      color: annotation.color,
      related_correction_id: annotation.related_correction_id,
      related_validation_id: annotation.related_validation_id,
      created_by: userId || annotation.created_by,
    }).select().single();
    
    if (error) throw error;
    
    return {
      id: data.id,
      type: data.type as Annotation["type"],
      location: data.location,
      text: data.text,
      color: data.color,
      related_correction_id: data.related_correction_id,
      related_validation_id: data.related_validation_id,
      created_by: data.created_by,
      created_at: data.created_at,
    };
  }

  async saveAnnotation(annotation: Annotation, documentId: string, userId?: string): Promise<void> {
    if (!supabaseAdmin) return;
    
    const { error } = await supabaseAdmin.from('annotations').upsert({
      id: annotation.id,
      document_id: documentId,
      type: annotation.type,
      location: annotation.location,
      text: annotation.text,
      color: annotation.color,
      related_correction_id: annotation.related_correction_id,
      related_validation_id: annotation.related_validation_id,
      created_by: userId || annotation.created_by,
    });
    
    if (error) throw error;
  }

  async updateAnnotation(id: string, updates: Partial<Annotation>, userId?: string): Promise<Annotation> {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    
    const updateData: any = {};
    if (updates.text !== undefined) updateData.text = updates.text;
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.location !== undefined) updateData.location = updates.location;
    
    const { data, error } = await supabaseAdmin
      .from('annotations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      id: data.id,
      type: data.type as Annotation["type"],
      location: data.location,
      text: data.text,
      color: data.color,
      related_correction_id: data.related_correction_id,
      related_validation_id: data.related_validation_id,
      created_by: data.created_by,
      created_at: data.created_at,
    };
  }

  async deleteAnnotation(annotationId: string, userId?: string): Promise<void> {
    if (!supabaseAdmin) return;
    
    let query = supabaseAdmin.from('annotations').delete().eq('id', annotationId);
    if (userId) {
      query = query.eq('created_by', userId);
    }
    
    const { error } = await query;
    if (error) throw error;
  }

  async getCrossDocValidations(claimId: string, userId?: string): Promise<CrossDocumentValidation[]> {
    return this.getCrossDocumentValidations(claimId, userId);
  }

  async getCrossDocValidationsPaginated(claimId: string, userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<CrossDocumentValidation>> {
    if (!supabaseAdmin) return { data: [], total: 0 };
    
    const page = pagination?.page || DEFAULT_PAGE;
    const limit = pagination?.limit || DEFAULT_LIMIT;
    const offset = (page - 1) * limit;
    
    let countQuery = supabaseAdmin.from('cross_document_validations').select('*', { count: 'exact', head: true }).eq('claim_id', claimId);
    let dataQuery = supabaseAdmin.from('cross_document_validations').select('*').eq('claim_id', claimId);
    
    if (userId) {
      countQuery = countQuery.eq('user_id', userId);
      dataQuery = dataQuery.eq('user_id', userId);
    }
    
    const [countResult, dataResult] = await Promise.all([
      countQuery,
      dataQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    ]);
    
    if (dataResult.error) return { data: [], total: 0 };
    
    const validations = (dataResult.data || []).map(row => ({
      id: row.id,
      claim_id: row.claim_id,
      field: row.field as CrossDocumentValidation["field"],
      severity: row.severity as CrossDocumentValidation["severity"],
      documents: row.documents,
      expected_value: row.expected_value,
      recommended_action: row.recommended_action as CrossDocumentValidation["recommended_action"],
      reasoning: row.reasoning,
      status: row.status as CrossDocumentValidation["status"],
      resolved_value: row.resolved_value,
      resolved_by: row.resolved_by,
      resolved_at: row.resolved_at,
    }));
    
    return { data: validations, total: countResult.count || 0 };
  }

  async getCrossDocumentValidations(claimId: string, userId?: string): Promise<CrossDocumentValidation[]> {
    if (!supabaseAdmin) return [];
    
    let query = supabaseAdmin
      .from('cross_document_validations')
      .select('*')
      .eq('claim_id', claimId);
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) return [];
    
    return (data || []).map(row => ({
      id: row.id,
      claim_id: row.claim_id,
      field: row.field as CrossDocumentValidation["field"],
      severity: row.severity as CrossDocumentValidation["severity"],
      documents: row.documents,
      expected_value: row.expected_value,
      recommended_action: row.recommended_action as CrossDocumentValidation["recommended_action"],
      reasoning: row.reasoning,
      status: row.status as CrossDocumentValidation["status"],
      resolved_value: row.resolved_value,
      resolved_by: row.resolved_by,
      resolved_at: row.resolved_at,
    }));
  }

  async createCrossDocValidation(validation: CrossDocumentValidation, userId?: string): Promise<CrossDocumentValidation> {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    
    const { data, error } = await supabaseAdmin.from('cross_document_validations').insert({
      id: validation.id,
      claim_id: validation.claim_id,
      field: validation.field,
      severity: validation.severity,
      documents: validation.documents,
      expected_value: validation.expected_value,
      recommended_action: validation.recommended_action,
      reasoning: validation.reasoning,
      status: validation.status,
      resolved_value: validation.resolved_value,
      resolved_by: validation.resolved_by,
      resolved_at: validation.resolved_at,
      user_id: userId,
    }).select().single();
    
    if (error) throw error;
    
    return {
      id: data.id,
      claim_id: data.claim_id,
      field: data.field as CrossDocumentValidation["field"],
      severity: data.severity as CrossDocumentValidation["severity"],
      documents: data.documents,
      expected_value: data.expected_value,
      recommended_action: data.recommended_action as CrossDocumentValidation["recommended_action"],
      reasoning: data.reasoning,
      status: data.status as CrossDocumentValidation["status"],
      resolved_value: data.resolved_value,
      resolved_by: data.resolved_by,
      resolved_at: data.resolved_at,
    };
  }

  async saveCrossDocumentValidation(validation: CrossDocumentValidation, userId?: string): Promise<void> {
    if (!supabaseAdmin) return;
    
    const { error } = await supabaseAdmin.from('cross_document_validations').upsert({
      id: validation.id,
      claim_id: validation.claim_id,
      field: validation.field,
      severity: validation.severity,
      documents: validation.documents,
      expected_value: validation.expected_value,
      recommended_action: validation.recommended_action,
      reasoning: validation.reasoning,
      status: validation.status,
      resolved_value: validation.resolved_value,
      resolved_by: validation.resolved_by,
      resolved_at: validation.resolved_at,
      user_id: userId,
    });
    
    if (error) throw error;
  }

  async resolveCrossDocValidation(id: string, resolvedValue: string, resolvedBy: string): Promise<void> {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    
    const { error } = await supabaseAdmin
      .from('cross_document_validations')
      .update({
        status: 'resolved',
        resolved_value: resolvedValue,
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id);
    
    if (error) throw error;
  }

  async escalateCrossDocValidation(id: string, reason: string): Promise<void> {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    
    const { error } = await supabaseAdmin
      .from('cross_document_validations')
      .update({
        status: 'escalated',
        escalation_reason: reason,
      })
      .eq('id', id);
    
    if (error) throw error;
  }

  async updateCrossDocumentValidationStatus(
    validationId: string,
    status: CrossDocumentValidation["status"],
    resolvedValue?: string,
    userId?: string
  ): Promise<void> {
    if (!supabaseAdmin) return;
    
    const update: any = { status };
    if (status === "resolved" && resolvedValue) {
      update.resolved_value = resolvedValue;
      update.resolved_by = userId;
      update.resolved_at = new Date().toISOString();
    }
    
    const { error } = await supabaseAdmin
      .from('cross_document_validations')
      .update(update)
      .eq('id', validationId);
    
    if (error) throw error;
  }

  async saveCorrectionPayload(payload: DocumentCorrectionPayload, userId?: string): Promise<void> {
    if (!supabaseAdmin) return;
    
    // Save all corrections
    for (const doc of payload.documents) {
      for (const correction of doc.corrections) {
        await this.saveCorrection({
          ...correction,
          claim_id: payload.claim.claim_id,
          evidence: {
            ...correction.evidence,
            source_document: doc.document_id,
          },
        }, userId);
      }
      
      // Save all annotations
      for (const annotation of doc.annotations) {
        await this.saveAnnotation({
          ...annotation,
          created_by: userId || annotation.created_by,
        }, doc.document_id, userId);
      }
    }
    
    // Save cross-document validations
    for (const validation of payload.cross_document_validations) {
      await this.saveCrossDocumentValidation({
        ...validation,
        claim_id: payload.claim.claim_id,
      }, userId);
    }
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

  async getClaimsPaginated(userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<Claim>> {
    const allClaims = Array.from(this.claims.values());
    const page = pagination?.page || DEFAULT_PAGE;
    const limit = pagination?.limit || DEFAULT_LIMIT;
    const offset = (page - 1) * limit;
    return { data: allClaims.slice(offset, offset + limit), total: allClaims.length };
  }

  async getClaimById(claimId: string, userId?: string): Promise<Claim | null> {
    return this.claims.get(claimId) || null;
  }

  async createClaim(claim: Partial<Claim> & { claimId: string }, userId?: string): Promise<Claim> {
    const newClaim: Claim = {
      claimId: claim.claimId,
      claimNumber: claim.claimNumber || claim.claimId,
      policyNumber: claim.policyNumber,
      status: claim.status || 'open',
      insuredName: claim.insuredName,
      dateOfLoss: claim.dateOfLoss,
      claimAmount: claim.claimAmount,
      adjusterName: claim.adjusterName,
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

  async deleteClaim(claimId: string, userId?: string): Promise<void> {
    this.claims.delete(claimId);
    for (const [documentId, document] of this.documents.entries()) {
      if (document.claimId === claimId) {
        this.documents.delete(documentId);
      }
    }
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

  // Canonical schema methods (in-memory implementations)
  private corrections: Map<string, Correction> = new Map();
  private annotations: Map<string, Annotation & { documentId: string }> = new Map();
  private crossDocValidations: Map<string, CrossDocumentValidation> = new Map();

  async getCorrections(documentId: string, userId?: string): Promise<Correction[]> {
    return Array.from(this.corrections.values()).filter(
      c => c.evidence.source_document === documentId
    );
  }

  async getCorrectionsPaginated(documentId: string, userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<Correction>> {
    const all = Array.from(this.corrections.values()).filter(c => c.evidence.source_document === documentId);
    const page = pagination?.page || DEFAULT_PAGE;
    const limit = pagination?.limit || DEFAULT_LIMIT;
    const offset = (page - 1) * limit;
    return { data: all.slice(offset, offset + limit), total: all.length };
  }

  async getCorrectionsByClaimId(claimId: string, userId?: string): Promise<Correction[]> {
    return Array.from(this.corrections.values()).filter(
      c => c.claim_id === claimId
    );
  }

  async createCorrection(correction: Correction, userId?: string): Promise<Correction> {
    this.corrections.set(correction.id, correction);
    return correction;
  }

  async saveCorrection(correction: Correction, userId?: string): Promise<void> {
    this.corrections.set(correction.id, correction);
  }

  async updateCorrectionStatus(
    correctionId: string,
    status: Correction["status"],
    appliedBy?: string,
    method?: string,
    userId?: string
  ): Promise<void> {
    const correction = this.corrections.get(correctionId);
    if (correction) {
      correction.status = status;
      if (status === "applied") {
        correction.applied_at = new Date().toISOString();
        correction.applied_by = appliedBy || userId;
        if (method) {
          correction.applied_method = method;
        }
      }
      this.corrections.set(correctionId, correction);
    }
  }

  async getAnnotations(documentId: string, userId?: string): Promise<Annotation[]> {
    return Array.from(this.annotations.values())
      .filter(annotation => annotation.documentId === documentId)
      .map(({ documentId: _documentId, ...annotation }) => annotation);
  }

  async getAnnotationsPaginated(documentId: string, userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<Annotation>> {
    const all = Array.from(this.annotations.values())
      .filter(annotation => annotation.documentId === documentId)
      .map(({ documentId: _documentId, ...annotation }) => annotation);
    const page = pagination?.page || DEFAULT_PAGE;
    const limit = pagination?.limit || DEFAULT_LIMIT;
    const offset = (page - 1) * limit;
    return { data: all.slice(offset, offset + limit), total: all.length };
  }

  async createAnnotation(annotation: Annotation, documentId: string, userId?: string): Promise<Annotation> {
    const created: Annotation & { documentId: string } = {
      ...annotation,
      documentId,
      created_by: userId || annotation.created_by,
    };
    this.annotations.set(annotation.id, created);
    const { documentId: _documentId, ...result } = created;
    return result;
  }

  async saveAnnotation(annotation: Annotation, documentId: string, userId?: string): Promise<void> {
    this.annotations.set(annotation.id, {
      ...annotation,
      documentId,
      created_by: userId || annotation.created_by,
    });
  }

  async updateAnnotation(id: string, updates: Partial<Annotation>, userId?: string): Promise<Annotation> {
    const existing = this.annotations.get(id);
    if (!existing) throw new Error('Annotation not found');
    
    const updated = {
      ...existing,
      ...updates,
    };
    this.annotations.set(id, updated);
    return updated;
  }

  async deleteAnnotation(annotationId: string, userId?: string): Promise<void> {
    this.annotations.delete(annotationId);
  }

  async getCrossDocValidations(claimId: string, userId?: string): Promise<CrossDocumentValidation[]> {
    return this.getCrossDocumentValidations(claimId, userId);
  }

  async getCrossDocValidationsPaginated(claimId: string, userId?: string, pagination?: PaginationParams): Promise<PaginatedResult<CrossDocumentValidation>> {
    const all = await this.getCrossDocumentValidations(claimId, userId);
    const page = pagination?.page || DEFAULT_PAGE;
    const limit = pagination?.limit || DEFAULT_LIMIT;
    const offset = (page - 1) * limit;
    return { data: all.slice(offset, offset + limit), total: all.length };
  }

  async getCrossDocumentValidations(claimId: string, userId?: string): Promise<CrossDocumentValidation[]> {
    return Array.from(this.crossDocValidations.values()).filter(
      validation => validation.claim_id === claimId
    );
  }

  async createCrossDocValidation(validation: CrossDocumentValidation, userId?: string): Promise<CrossDocumentValidation> {
    this.crossDocValidations.set(validation.id, validation);
    return validation;
  }

  async saveCrossDocumentValidation(validation: CrossDocumentValidation, userId?: string): Promise<void> {
    this.crossDocValidations.set(validation.id, validation);
  }

  async resolveCrossDocValidation(id: string, resolvedValue: string, resolvedBy: string): Promise<void> {
    const validation = this.crossDocValidations.get(id);
    if (validation) {
      validation.status = "resolved";
      validation.resolved_value = resolvedValue;
      validation.resolved_by = resolvedBy;
      validation.resolved_at = new Date().toISOString();
      this.crossDocValidations.set(id, validation);
    }
  }

  async escalateCrossDocValidation(id: string, reason: string): Promise<void> {
    const validation = this.crossDocValidations.get(id);
    if (validation) {
      validation.status = "escalated" as CrossDocumentValidation["status"];
      // Note: escalation_reason not in schema, but we can add it if needed
      this.crossDocValidations.set(id, validation);
    }
  }

  async updateCrossDocumentValidationStatus(
    validationId: string,
    status: CrossDocumentValidation["status"],
    resolvedValue?: string,
    userId?: string
  ): Promise<void> {
    const validation = this.crossDocValidations.get(validationId);
    if (validation) {
      validation.status = status;
      if (status === "resolved" && resolvedValue) {
        validation.resolved_value = resolvedValue;
        validation.resolved_by = userId;
        validation.resolved_at = new Date().toISOString();
      }
      this.crossDocValidations.set(validationId, validation);
    }
  }

  async saveCorrectionPayload(payload: DocumentCorrectionPayload, userId?: string): Promise<void> {
    for (const doc of payload.documents) {
      for (const correction of doc.corrections) {
        await this.saveCorrection({
          ...correction,
          claim_id: payload.claim.claim_id,
          evidence: {
            ...correction.evidence,
            source_document: doc.document_id,
          },
        }, userId);
      }
      for (const annotation of doc.annotations) {
        await this.saveAnnotation(annotation, doc.document_id, userId);
      }
    }
    for (const validation of payload.cross_document_validations) {
      await this.saveCrossDocumentValidation({
        ...validation,
        claim_id: payload.claim.claim_id,
      }, userId);
    }
  }
}

export const storage: IStorage = isSupabaseConfigured() 
  ? new SupabaseStorage() 
  : new MemStorage();
