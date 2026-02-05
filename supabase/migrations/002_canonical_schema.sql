-- ============================================
-- Claims IQ Core Canonical Schema Migration
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
  claim_id TEXT NOT NULL,
  
  -- Correction details
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'typo', 'date_error', 'phone_format', 'name_mismatch',
    'address_error', 'numeric_error', 'missing_value',
    'format_standardization', 'data_inconsistency'
  )),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  
  -- Location (dual strategy)
  location JSONB NOT NULL,
  
  -- Values
  found_value TEXT NOT NULL,
  expected_value TEXT NOT NULL,
  
  -- Confidence & Review
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  requires_human_review BOOLEAN DEFAULT true,
  recommended_action VARCHAR(30) CHECK (recommended_action IN (
    'auto_correct', 'flag_for_review', 'escalate', 'informational'
  )),
  
  -- Evidence
  evidence JSONB,
  
  -- Form field hint
  form_field_name VARCHAR(255),
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'manual')),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES auth.users(id),
  applied_method VARCHAR(50),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key to documents
  CONSTRAINT fk_document FOREIGN KEY (document_id) 
    REFERENCES documents(document_id) ON DELETE CASCADE
);

-- --------------------------------------------
-- Annotations Table
-- Stores visual annotations on documents
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id TEXT NOT NULL,
  
  -- Annotation type
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'highlight', 'comment', 'flag', 'strikethrough', 'underline'
  )),
  
  -- Location
  location JSONB NOT NULL,
  
  -- Content
  text TEXT,
  color VARCHAR(7), -- Hex color
  
  -- Linkage
  related_correction_id UUID REFERENCES corrections(id) ON DELETE SET NULL,
  related_validation_id UUID,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_annotation_document FOREIGN KEY (document_id)
    REFERENCES documents(document_id) ON DELETE CASCADE
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
CREATE INDEX IF NOT EXISTS idx_corrections_document ON corrections(document_id);
CREATE INDEX IF NOT EXISTS idx_corrections_claim ON corrections(claim_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON corrections(status);
CREATE INDEX IF NOT EXISTS idx_annotations_document ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);
CREATE INDEX IF NOT EXISTS idx_validations_claim ON cross_document_validations(claim_id);
CREATE INDEX IF NOT EXISTS idx_validations_status ON cross_document_validations(status);
CREATE INDEX IF NOT EXISTS idx_validations_severity ON cross_document_validations(severity);

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

-- Annotations policies  
CREATE POLICY annotations_select ON annotations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY annotations_insert ON annotations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY annotations_update ON annotations
  FOR UPDATE USING (created_by = auth.uid() OR auth.uid() IS NOT NULL);

CREATE POLICY annotations_delete ON annotations
  FOR DELETE USING (created_by = auth.uid() OR auth.uid() IS NOT NULL);

-- Cross-document validations policies
CREATE POLICY validations_select ON cross_document_validations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY validations_insert ON cross_document_validations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY validations_update ON cross_document_validations
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- --------------------------------------------
-- Triggers for updated_at
-- --------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corrections_updated_at
  BEFORE UPDATE ON corrections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER validations_updated_at
  BEFORE UPDATE ON cross_document_validations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
