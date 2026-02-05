-- ============================================
-- Claims IQ Core Canonical Schema ROLLBACK
-- Run this to undo 002_canonical_schema.sql
-- ============================================

-- Drop triggers first
DROP TRIGGER IF EXISTS corrections_updated_at ON corrections;
DROP TRIGGER IF EXISTS annotations_updated_at ON annotations;
DROP TRIGGER IF EXISTS validations_updated_at ON cross_document_validations;

-- Drop function
DROP FUNCTION IF EXISTS update_canonical_updated_at();

-- Drop RLS policies for corrections
DROP POLICY IF EXISTS corrections_select ON corrections;
DROP POLICY IF EXISTS corrections_insert ON corrections;
DROP POLICY IF EXISTS corrections_update ON corrections;
DROP POLICY IF EXISTS corrections_delete ON corrections;

-- Drop RLS policies for annotations
DROP POLICY IF EXISTS annotations_select ON annotations;
DROP POLICY IF EXISTS annotations_insert ON annotations;
DROP POLICY IF EXISTS annotations_update ON annotations;
DROP POLICY IF EXISTS annotations_delete ON annotations;

-- Drop RLS policies for cross_document_validations
DROP POLICY IF EXISTS validations_select ON cross_document_validations;
DROP POLICY IF EXISTS validations_insert ON cross_document_validations;
DROP POLICY IF EXISTS validations_update ON cross_document_validations;
DROP POLICY IF EXISTS validations_delete ON cross_document_validations;

-- Drop indexes
DROP INDEX IF EXISTS idx_corrections_document;
DROP INDEX IF EXISTS idx_corrections_claim;
DROP INDEX IF EXISTS idx_corrections_status;
DROP INDEX IF EXISTS idx_corrections_user_id;
DROP INDEX IF EXISTS idx_annotations_document;
DROP INDEX IF EXISTS idx_annotations_type;
DROP INDEX IF EXISTS idx_annotations_user_id;
DROP INDEX IF EXISTS idx_validations_claim;
DROP INDEX IF EXISTS idx_validations_status;
DROP INDEX IF EXISTS idx_validations_severity;
DROP INDEX IF EXISTS idx_validations_user_id;

-- Disable RLS before dropping tables
ALTER TABLE IF EXISTS corrections DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS annotations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cross_document_validations DISABLE ROW LEVEL SECURITY;

-- Drop tables (order matters due to foreign key constraints)
DROP TABLE IF EXISTS annotations;
DROP TABLE IF EXISTS cross_document_validations;
DROP TABLE IF EXISTS corrections;

-- Verify rollback completed
SELECT 'Rollback completed. Tables dropped:' as status;
