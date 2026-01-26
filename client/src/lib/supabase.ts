import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Some features may not work.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Tables = {
  claims: {
    id: string;
    claim_id: string;
    claim_number: string | null;
    policy_number: string | null;
    insured_name: string | null;
    date_of_loss: string | null;
    claim_amount: string | null;
    status: string | null;
    adjuster_name: string | null;
    created_at: string;
    updated_at: string;
  };
  documents: {
    id: string;
    document_id: string;
    claim_id: string;
    title: string;
    file_path: string;
    file_size: number | null;
    mime_type: string | null;
    created_at: string;
    updated_at: string;
  };
  issues: {
    id: string;
    issue_id: string;
    document_id: string;
    type: string;
    severity: string;
    confidence: number;
    page_index: number;
    rect: object;
    found_value: string | null;
    expected_value: string | null;
    form_field_name: string | null;
    label: string | null;
    suggested_fix: object;
    status: string;
    created_at: string;
    updated_at: string;
  };
  audit_logs: {
    id: string;
    claim_id: string;
    document_id: string;
    issue_id: string;
    action: string;
    method: string | null;
    before_value: string | null;
    after_value: string | null;
    user_id: string;
    created_at: string;
  };
};
