-- Migration: Add canonical correction schema tables
-- Run this after the initial schema.sql migration

-- Corrections table (canonical format)
CREATE TABLE IF NOT EXISTS corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('typo', 'date_error', 'phone_format', 'name_mismatch', 'address_error', 'numeric_error', 'missing_value', 'format_standardization', 'data_inconsistency')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  location JSONB NOT NULL, -- Contains bbox and/or search_text
  found_value TEXT,
  expected_value TEXT,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  requires_human_review BOOLEAN DEFAULT true,
  recommended_action VARCHAR(30) NOT NULL CHECK (recommended_action IN ('auto_correct', 'flag_for_review', 'escalate', 'informational')),
  evidence JSONB NOT NULL, -- Contains source_document, source_field, reasoning
  form_field_name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'manual')),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_method VARCHAR(50),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Annotations table
CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('highlight', 'comment', 'flag', 'strikethrough', 'underline')),
  location JSONB NOT NULL,
  text TEXT,
  color VARCHAR(7), -- Hex color
  related_correction_id UUID REFERENCES corrections(id) ON DELETE SET NULL,
  related_validation_id UUID REFERENCES cross_document_validations(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cross-document validations table
CREATE TABLE IF NOT EXISTS cross_document_validations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  field VARCHAR(50) NOT NULL CHECK (field IN ('claim_number', 'policy_number', 'insured_name', 'insured_phone', 'insured_email', 'date_of_loss', 'property_address', 'loss_amount', 'payment_amount', 'adjuster_name', 'adjuster_phone', 'coverage_type', 'deductible')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  documents JSONB NOT NULL, -- Array of DocumentValue objects
  expected_value TEXT,
  recommended_action VARCHAR(30) NOT NULL CHECK (recommended_action IN ('auto_correct', 'flag_for_review', 'escalate', 'informational')),
  reasoning TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored')),
  resolved_value TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_corrections_document_id ON corrections(document_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON corrections(status);
CREATE INDEX IF NOT EXISTS idx_corrections_type ON corrections(type);
CREATE INDEX IF NOT EXISTS idx_corrections_user_id ON corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_annotations_document_id ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);
CREATE INDEX IF NOT EXISTS idx_annotations_related_correction ON annotations(related_correction_id);
CREATE INDEX IF NOT EXISTS idx_cross_doc_validations_claim_id ON cross_document_validations(claim_id);
CREATE INDEX IF NOT EXISTS idx_cross_doc_validations_status ON cross_document_validations(status);
CREATE INDEX IF NOT EXISTS idx_cross_doc_validations_field ON cross_document_validations(field);
CREATE INDEX IF NOT EXISTS idx_cross_doc_validations_user_id ON cross_document_validations(user_id);

-- Enable RLS
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
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own annotations" ON annotations
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own annotations" ON annotations
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own annotations" ON annotations
  FOR DELETE USING (auth.uid() = created_by);

-- RLS Policies for cross_document_validations
CREATE POLICY "Users can view their own validations" ON cross_document_validations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own validations" ON cross_document_validations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own validations" ON cross_document_validations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own validations" ON cross_document_validations
  FOR DELETE USING (auth.uid() = user_id);

-- Updated_at triggers
CREATE TRIGGER update_corrections_updated_at
  BEFORE UPDATE ON corrections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cross_doc_validations_updated_at
  BEFORE UPDATE ON cross_document_validations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
