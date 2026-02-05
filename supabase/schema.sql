-- Supabase Schema for Claims File Correction Workbench
-- Run this SQL in your Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Claims table
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id TEXT UNIQUE NOT NULL,
  claim_number TEXT,
  policy_number TEXT,
  insured_name TEXT,
  date_of_loss DATE,
  claim_amount TEXT,
  status TEXT DEFAULT 'open',
  adjuster_name TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id TEXT UNIQUE NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'application/pdf',
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issues table
CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id TEXT UNIQUE NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  confidence DECIMAL(3,2) NOT NULL,
  page_index INTEGER NOT NULL DEFAULT 0,
  rect JSONB NOT NULL,
  found_value TEXT,
  expected_value TEXT,
  form_field_name TEXT,
  label TEXT,
  suggested_fix JSONB,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'APPLIED', 'MANUAL', 'REJECTED')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('AUTO_FIX', 'MANUAL_FIX', 'REJECT')),
  method TEXT,
  before_value TEXT,
  after_value TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_claims_user_id ON claims(user_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_documents_claim_id ON documents(claim_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_issues_document_id ON issues(document_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_claim_id ON audit_logs(claim_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_document_id ON audit_logs(document_id);

-- Enable Row Level Security (RLS)
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for claims
CREATE POLICY "Users can view their own claims" ON claims
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own claims" ON claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own claims" ON claims
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own claims" ON claims
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for documents
CREATE POLICY "Users can view their own documents" ON documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents" ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents" ON documents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents" ON documents
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for issues
CREATE POLICY "Users can view their own issues" ON issues
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own issues" ON issues
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own issues" ON issues
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own issues" ON issues
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for audit_logs
CREATE POLICY "Users can view their own audit logs" ON audit_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own audit logs" ON audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_issues_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Storage bucket setup (run in SQL Editor)
-- Note: Create the 'documents' bucket in Supabase Dashboard > Storage
-- Or use the API to create it

-- Storage policies for documents bucket
-- Allow authenticated users to upload files
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Users can upload their own files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own files"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- Claims IQ Core Canonical Schema Tables
-- Added for Phase 6 implementation
-- ============================================

-- Corrections table - Stores canonical corrections per document
CREATE TABLE IF NOT EXISTS corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'typo', 'date_error', 'phone_format', 'name_mismatch',
    'address_error', 'numeric_error', 'missing_value',
    'format_standardization', 'data_inconsistency'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  location JSONB NOT NULL,
  found_value TEXT NOT NULL,
  expected_value TEXT NOT NULL,
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  requires_human_review BOOLEAN DEFAULT true,
  recommended_action TEXT CHECK (recommended_action IN (
    'auto_correct', 'flag_for_review', 'escalate', 'informational'
  )),
  evidence JSONB,
  form_field_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'manual')),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES auth.users(id),
  applied_method TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Annotations table - Stores visual annotations on documents
CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'highlight', 'comment', 'flag', 'strikethrough', 'underline'
  )),
  location JSONB NOT NULL,
  text TEXT,
  color TEXT,
  related_correction_id UUID REFERENCES corrections(id) ON DELETE SET NULL,
  related_validation_id UUID,
  created_by UUID REFERENCES auth.users(id),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cross-document validations table - Stores inconsistencies across claim documents
CREATE TABLE IF NOT EXISTS cross_document_validations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id TEXT NOT NULL,
  field TEXT NOT NULL CHECK (field IN (
    'claim_number', 'policy_number', 'insured_name', 'insured_phone',
    'insured_email', 'date_of_loss', 'property_address', 'loss_amount',
    'payment_amount', 'adjuster_name', 'adjuster_phone', 'coverage_type',
    'deductible'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  documents JSONB NOT NULL,
  expected_value TEXT,
  recommended_action TEXT CHECK (recommended_action IN (
    'auto_correct', 'flag_for_review', 'escalate', 'informational'
  )),
  reasoning TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored', 'escalated')),
  resolved_value TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  escalation_reason TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for canonical schema tables
CREATE INDEX IF NOT EXISTS idx_corrections_document_id ON corrections(document_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON corrections(status);
CREATE INDEX IF NOT EXISTS idx_corrections_user_id ON corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_annotations_document_id ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);
CREATE INDEX IF NOT EXISTS idx_annotations_user_id ON annotations(user_id);
CREATE INDEX IF NOT EXISTS idx_validations_claim_id ON cross_document_validations(claim_id);
CREATE INDEX IF NOT EXISTS idx_validations_status ON cross_document_validations(status);
CREATE INDEX IF NOT EXISTS idx_validations_severity ON cross_document_validations(severity);
CREATE INDEX IF NOT EXISTS idx_validations_user_id ON cross_document_validations(user_id);

-- Enable RLS on canonical schema tables
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_document_validations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for corrections
CREATE POLICY "Users can view their own corrections" ON corrections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own corrections" ON corrections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own corrections" ON corrections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own corrections" ON corrections
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for annotations
CREATE POLICY "Users can view their own annotations" ON annotations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own annotations" ON annotations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own annotations" ON annotations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own annotations" ON annotations
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for cross_document_validations
CREATE POLICY "Users can view their own validations" ON cross_document_validations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own validations" ON cross_document_validations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own validations" ON cross_document_validations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own validations" ON cross_document_validations
  FOR DELETE USING (auth.uid() = user_id);

-- Updated_at triggers for canonical schema tables
CREATE TRIGGER update_corrections_updated_at
  BEFORE UPDATE ON corrections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_validations_updated_at
  BEFORE UPDATE ON cross_document_validations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
