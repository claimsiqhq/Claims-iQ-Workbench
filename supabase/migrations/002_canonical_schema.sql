-- ============================================
-- Claims IQ Core Canonical Schema Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------
-- Corrections Table
-- Stores canonical corrections per document
-- --------------------------------------------
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
  applied_by UUID,
  applied_method TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------
-- Annotations Table
-- Stores visual annotations on documents
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'highlight', 'comment', 'flag', 'strikethrough', 'underline'
  )),
  location JSONB NOT NULL,
  text TEXT,
  color TEXT,
  related_correction_id UUID,
  related_validation_id UUID,
  created_by UUID,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------
-- Cross-document Validations Table
-- Stores inconsistencies across claim documents
-- --------------------------------------------
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
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  escalation_reason TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_corrections_document ON corrections(document_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON corrections(status);
CREATE INDEX IF NOT EXISTS idx_corrections_user_id ON corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_annotations_document ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);
CREATE INDEX IF NOT EXISTS idx_annotations_user_id ON annotations(user_id);
CREATE INDEX IF NOT EXISTS idx_validations_claim ON cross_document_validations(claim_id);
CREATE INDEX IF NOT EXISTS idx_validations_status ON cross_document_validations(status);
CREATE INDEX IF NOT EXISTS idx_validations_severity ON cross_document_validations(severity);
CREATE INDEX IF NOT EXISTS idx_validations_user_id ON cross_document_validations(user_id);

-- Enable RLS
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_document_validations ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------
-- Row Level Security Policies
-- --------------------------------------------

-- Corrections policies
CREATE POLICY corrections_select ON corrections
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY corrections_insert ON corrections
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY corrections_update ON corrections
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY corrections_delete ON corrections
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Annotations policies  
CREATE POLICY annotations_select ON annotations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY annotations_insert ON annotations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY annotations_update ON annotations
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY annotations_delete ON annotations
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Cross-document validations policies
CREATE POLICY validations_select ON cross_document_validations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY validations_insert ON cross_document_validations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY validations_update ON cross_document_validations
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY validations_delete ON cross_document_validations
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- --------------------------------------------
-- Triggers for updated_at
-- --------------------------------------------

CREATE OR REPLACE FUNCTION update_canonical_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corrections_updated_at
  BEFORE UPDATE ON corrections
  FOR EACH ROW EXECUTE FUNCTION update_canonical_updated_at();

CREATE TRIGGER annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW EXECUTE FUNCTION update_canonical_updated_at();

CREATE TRIGGER validations_updated_at
  BEFORE UPDATE ON cross_document_validations
  FOR EACH ROW EXECUTE FUNCTION update_canonical_updated_at();

-- Verify tables were created
SELECT 'corrections' as table_name, COUNT(*) as row_count FROM corrections
UNION ALL
SELECT 'annotations', COUNT(*) FROM annotations
UNION ALL
SELECT 'cross_document_validations', COUNT(*) FROM cross_document_validations;
