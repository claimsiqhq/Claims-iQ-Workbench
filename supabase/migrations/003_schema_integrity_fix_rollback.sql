-- ============================================
-- Rollback for 003_schema_integrity_fix.sql
-- ============================================

-- Remove RLS policies (reset to permissive authenticated access)
DROP POLICY IF EXISTS "Users can view their own corrections" ON corrections;
DROP POLICY IF EXISTS "Users can insert their own corrections" ON corrections;
DROP POLICY IF EXISTS "Users can update their own corrections" ON corrections;
DROP POLICY IF EXISTS "Users can delete their own corrections" ON corrections;

CREATE POLICY corrections_select ON corrections
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY corrections_insert ON corrections
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY corrections_update ON corrections
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY corrections_delete ON corrections
  FOR DELETE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can view their own annotations" ON annotations;
DROP POLICY IF EXISTS "Users can insert their own annotations" ON annotations;
DROP POLICY IF EXISTS "Users can update their own annotations" ON annotations;
DROP POLICY IF EXISTS "Users can delete their own annotations" ON annotations;

CREATE POLICY annotations_select ON annotations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY annotations_insert ON annotations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY annotations_update ON annotations
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY annotations_delete ON annotations
  FOR DELETE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can view their own validations" ON cross_document_validations;
DROP POLICY IF EXISTS "Users can insert their own validations" ON cross_document_validations;
DROP POLICY IF EXISTS "Users can update their own validations" ON cross_document_validations;
DROP POLICY IF EXISTS "Users can delete their own validations" ON cross_document_validations;

CREATE POLICY validations_select ON cross_document_validations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY validations_insert ON cross_document_validations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY validations_update ON cross_document_validations
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY validations_delete ON cross_document_validations
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Drop added index and constraints
DROP INDEX IF EXISTS idx_corrections_claim_id;

ALTER TABLE corrections DROP CONSTRAINT IF EXISTS fk_correction_document;
ALTER TABLE corrections DROP CONSTRAINT IF EXISTS fk_correction_claim;
ALTER TABLE annotations DROP CONSTRAINT IF EXISTS fk_annotation_document;
ALTER TABLE annotations DROP CONSTRAINT IF EXISTS fk_annotation_validation;
ALTER TABLE cross_document_validations DROP CONSTRAINT IF EXISTS fk_validation_claim;

-- Remove claim_id column (data loss)
ALTER TABLE corrections DROP COLUMN IF EXISTS claim_id;

-- Issues table rollback
ALTER TABLE issues DROP COLUMN IF EXISTS search_text;
ALTER TABLE issues ALTER COLUMN rect SET NOT NULL;
