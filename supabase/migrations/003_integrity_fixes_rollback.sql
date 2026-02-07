ALTER TABLE cross_document_validations
  DROP CONSTRAINT IF EXISTS cross_document_validations_claim_id_fkey;

ALTER TABLE annotations
  DROP CONSTRAINT IF EXISTS annotations_document_id_fkey;

ALTER TABLE corrections
  DROP CONSTRAINT IF EXISTS corrections_document_id_fkey;

ALTER TABLE corrections
  DROP CONSTRAINT IF EXISTS corrections_claim_id_fkey;

ALTER TABLE corrections
  DROP COLUMN IF EXISTS claim_id;

ALTER TABLE issues
  ALTER COLUMN rect SET NOT NULL;

DROP INDEX IF EXISTS idx_corrections_claim_id;
