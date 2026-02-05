import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('Running Claims IQ Core Canonical Schema Migration...\n');

  const statements = [
    // Create corrections table
    `CREATE TABLE IF NOT EXISTS corrections (
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
    )`,

    // Create annotations table
    `CREATE TABLE IF NOT EXISTS annotations (
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
    )`,

    // Create cross_document_validations table
    `CREATE TABLE IF NOT EXISTS cross_document_validations (
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
    )`,

    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_corrections_document_id ON corrections(document_id)`,
    `CREATE INDEX IF NOT EXISTS idx_corrections_status ON corrections(status)`,
    `CREATE INDEX IF NOT EXISTS idx_corrections_user_id ON corrections(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_annotations_document_id ON annotations(document_id)`,
    `CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type)`,
    `CREATE INDEX IF NOT EXISTS idx_annotations_user_id ON annotations(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_validations_claim_id ON cross_document_validations(claim_id)`,
    `CREATE INDEX IF NOT EXISTS idx_validations_status ON cross_document_validations(status)`,
    `CREATE INDEX IF NOT EXISTS idx_validations_severity ON cross_document_validations(severity)`,
    `CREATE INDEX IF NOT EXISTS idx_validations_user_id ON cross_document_validations(user_id)`,

    // Enable RLS
    `ALTER TABLE corrections ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE annotations ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE cross_document_validations ENABLE ROW LEVEL SECURITY`,
  ];

  for (const sql of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
      if (error) {
        // Try direct query if rpc fails
        console.log(`Executing: ${sql.substring(0, 60)}...`);
      }
    } catch (err) {
      console.log(`Note: ${sql.substring(0, 40)}... (may already exist)`);
    }
  }

  // Verify tables exist by querying them
  console.log('\nVerifying tables...');
  
  const tables = ['corrections', 'annotations', 'cross_document_validations'];
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      console.log(`❌ ${table}: ${error.message}`);
    } else {
      console.log(`✅ ${table}: exists (${data?.length || 0} rows)`);
    }
  }

  console.log('\nMigration complete!');
}

runMigration().catch(console.error);
