-- ============================================
-- Schema Integrity Fixes
-- Align canonical schema and issues table
-- ============================================

-- Issues table: allow missing rect and store search_text fallback
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS search_text TEXT;

ALTER TABLE issues
  ALTER COLUMN rect DROP NOT NULL;

-- Corrections table: ensure claim_id exists and is populated
ALTER TABLE corrections
  ADD COLUMN IF NOT EXISTS claim_id TEXT;

UPDATE corrections c
SET claim_id = d.claim_id
FROM documents d
WHERE c.document_id = d.document_id
  AND c.claim_id IS NULL;

ALTER TABLE corrections
  ALTER COLUMN claim_id SET NOT NULL;

-- Foreign key constraints (idempotent)
DO $$ BEGIN
  ALTER TABLE corrections
    ADD CONSTRAINT fk_correction_document FOREIGN KEY (document_id)
    REFERENCES documents(document_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE corrections
    ADD CONSTRAINT fk_correction_claim FOREIGN KEY (claim_id)
    REFERENCES claims(claim_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE annotations
    ADD CONSTRAINT fk_annotation_document FOREIGN KEY (document_id)
    REFERENCES documents(document_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE annotations
    ADD CONSTRAINT fk_annotation_validation FOREIGN KEY (related_validation_id)
    REFERENCES cross_document_validations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cross_document_validations
    ADD CONSTRAINT fk_validation_claim FOREIGN KEY (claim_id)
    REFERENCES claims(claim_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes for claim_id lookups on corrections
CREATE INDEX IF NOT EXISTS idx_corrections_claim_id ON corrections(claim_id);

-- RLS policies: tighten to user-owned rows
DROP POLICY IF EXISTS corrections_select ON corrections;
DROP POLICY IF EXISTS corrections_insert ON corrections;
DROP POLICY IF EXISTS corrections_update ON corrections;
DROP POLICY IF EXISTS corrections_delete ON corrections;

CREATE POLICY "Users can view their own corrections" ON corrections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own corrections" ON corrections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own corrections" ON corrections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own corrections" ON corrections
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS annotations_select ON annotations;
DROP POLICY IF EXISTS annotations_insert ON annotations;
DROP POLICY IF EXISTS annotations_update ON annotations;
DROP POLICY IF EXISTS annotations_delete ON annotations;

CREATE POLICY "Users can view their own annotations" ON annotations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own annotations" ON annotations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own annotations" ON annotations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own annotations" ON annotations
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS validations_select ON cross_document_validations;
DROP POLICY IF EXISTS validations_insert ON cross_document_validations;
DROP POLICY IF EXISTS validations_update ON cross_document_validations;
DROP POLICY IF EXISTS validations_delete ON cross_document_validations;

CREATE POLICY "Users can view their own validations" ON cross_document_validations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own validations" ON cross_document_validations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own validations" ON cross_document_validations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own validations" ON cross_document_validations
  FOR DELETE USING (auth.uid() = user_id);
