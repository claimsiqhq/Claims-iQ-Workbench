-- ============================================
-- Pending Column Fixes Migration
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================

-- 1. Create migration helper function for future use
CREATE OR REPLACE FUNCTION run_migration_sql(sql_text TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_text;
END;
$$;
GRANT EXECUTE ON FUNCTION run_migration_sql(TEXT) TO service_role;

-- 2. Add missing columns to issues table
ALTER TABLE issues ADD COLUMN IF NOT EXISTS search_text TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS claim_id TEXT;

-- 3. Make rect nullable on issues (was NOT NULL)
ALTER TABLE issues ALTER COLUMN rect DROP NOT NULL;

-- 4. Backfill claim_id on issues from documents
UPDATE issues i
SET claim_id = d.claim_id
FROM documents d
WHERE i.document_id = d.document_id
  AND i.claim_id IS NULL;

-- 5. Add claim_id foreign key on issues (idempotent)
DO $$ BEGIN
  ALTER TABLE issues
    ADD CONSTRAINT fk_issues_claim FOREIGN KEY (claim_id)
    REFERENCES claims(claim_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Add missing claim_id to corrections if needed
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS claim_id TEXT;

-- 7. Backfill claim_id on corrections from documents
UPDATE corrections c
SET claim_id = d.claim_id
FROM documents d
WHERE c.document_id = d.document_id
  AND c.claim_id IS NULL;

-- 8. Add foreign keys on corrections (idempotent)
DO $$ BEGIN
  ALTER TABLE corrections
    ADD CONSTRAINT fk_correction_document FOREIGN KEY (document_id)
    REFERENCES documents(document_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE corrections
    ADD CONSTRAINT fk_correction_claim FOREIGN KEY (claim_id)
    REFERENCES claims(claim_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 9. Add foreign keys on annotations (idempotent)
DO $$ BEGIN
  ALTER TABLE annotations
    ADD CONSTRAINT fk_annotation_document FOREIGN KEY (document_id)
    REFERENCES documents(document_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 10. Add foreign key on cross_document_validations (idempotent)
DO $$ BEGIN
  ALTER TABLE cross_document_validations
    ADD CONSTRAINT fk_validation_claim FOREIGN KEY (claim_id)
    REFERENCES claims(claim_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 11. Create indexes
CREATE INDEX IF NOT EXISTS idx_issues_claim_id ON issues(claim_id);
CREATE INDEX IF NOT EXISTS idx_issues_document_id ON issues(document_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_corrections_claim_id ON corrections(claim_id);
CREATE INDEX IF NOT EXISTS idx_corrections_document ON corrections(document_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON corrections(status);
CREATE INDEX IF NOT EXISTS idx_annotations_document ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);
CREATE INDEX IF NOT EXISTS idx_validations_claim ON cross_document_validations(claim_id);
CREATE INDEX IF NOT EXISTS idx_validations_status ON cross_document_validations(status);

-- 12. Verify
SELECT 'issues' as tbl, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'issues' AND column_name IN ('search_text', 'claim_id', 'rect')
UNION ALL
SELECT 'corrections', column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'corrections' AND column_name = 'claim_id';
