-- Add claim linkage and foreign keys for canonical tables
ALTER TABLE issues
  ALTER COLUMN rect DROP NOT NULL;

ALTER TABLE corrections
  ADD COLUMN IF NOT EXISTS claim_id TEXT;

UPDATE corrections
SET claim_id = documents.claim_id
FROM documents
WHERE corrections.document_id = documents.document_id
  AND corrections.claim_id IS NULL;

ALTER TABLE corrections
  ALTER COLUMN claim_id SET NOT NULL;

ALTER TABLE corrections
  ADD CONSTRAINT corrections_claim_id_fkey
  FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE;

ALTER TABLE corrections
  ADD CONSTRAINT corrections_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE;

ALTER TABLE annotations
  ADD CONSTRAINT annotations_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE;

ALTER TABLE cross_document_validations
  ADD CONSTRAINT cross_document_validations_claim_id_fkey
  FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_corrections_claim_id ON corrections(claim_id);
