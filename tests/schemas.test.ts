import { describe, it, expect } from 'vitest';
import { 
  CorrectionSchema, 
  AnnotationSchema, 
  CrossDocumentValidationSchema,
  DocumentCorrectionPayloadSchema 
} from '@shared/schemas';

describe('CorrectionSchema', () => {
  it('validates a complete correction', () => {
    const correction = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      claim_id: 'CLM-001',
      type: 'date_error',
      severity: 'warning',
      location: {
        bbox: { pageIndex: 0, left: 100, top: 200, width: 50, height: 20 },
        search_text: { text: '01/15/2023', occurrence: 1 },
      },
      found_value: '01/15/2023',
      expected_value: '01/15/2024',
      confidence: 0.95,
      requires_human_review: false,
      recommended_action: 'auto_correct',
      evidence: { reasoning: 'Year mismatch detected' },
      status: 'pending',
    };
    
    expect(() => CorrectionSchema.parse(correction)).not.toThrow();
  });
  
  it('requires at least bbox or search_text in location', () => {
    const invalidCorrection = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      claim_id: 'CLM-001',
      type: 'typo',
      severity: 'info',
      location: {}, // Neither bbox nor search_text
      found_value: 'test',
      expected_value: 'Test',
      confidence: 0.8,
      requires_human_review: true,
      recommended_action: 'flag_for_review',
      evidence: { reasoning: 'test' },
    };
    
    expect(() => CorrectionSchema.parse(invalidCorrection)).toThrow();
  });

  it('accepts correction with only bbox', () => {
    const correction = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      claim_id: 'CLM-001',
      type: 'typo',
      severity: 'info',
      location: {
        bbox: { pageIndex: 0, left: 100, top: 200, width: 50, height: 20 },
      },
      found_value: 'test',
      expected_value: 'Test',
      confidence: 0.8,
      requires_human_review: true,
      recommended_action: 'flag_for_review',
      evidence: { reasoning: 'test' },
    };
    
    expect(() => CorrectionSchema.parse(correction)).not.toThrow();
  });

  it('accepts correction with only search_text', () => {
    const correction = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      claim_id: 'CLM-001',
      type: 'typo',
      severity: 'info',
      location: {
        search_text: { text: 'test value', occurrence: 1 },
      },
      found_value: 'test',
      expected_value: 'Test',
      confidence: 0.8,
      requires_human_review: true,
      recommended_action: 'flag_for_review',
      evidence: { reasoning: 'test' },
    };
    
    expect(() => CorrectionSchema.parse(correction)).not.toThrow();
  });
});

describe('AnnotationSchema', () => {
  it('validates all annotation types', () => {
    const types = ['highlight', 'comment', 'flag', 'strikethrough', 'underline'];
    
    for (const type of types) {
      const annotation = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type,
        location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } },
        created_by: 'user-123',
        created_at: new Date().toISOString(),
      };
      
      expect(() => AnnotationSchema.parse(annotation)).not.toThrow();
    }
  });

  it('requires location with bbox or search_text', () => {
    const invalidAnnotation = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'highlight',
      location: {},
      created_by: 'user-123',
      created_at: new Date().toISOString(),
    };
    
    expect(() => AnnotationSchema.parse(invalidAnnotation)).toThrow();
  });
});

describe('CrossDocumentValidationSchema', () => {
  it('validates a complete validation', () => {
    const validation = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      field: 'claim_number',
      severity: 'critical',
      documents: [
        {
          document_id: 'doc1',
          document_name: 'Form A',
          found_value: 'CLM-001',
          location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } },
          confidence: 0.95,
        },
        {
          document_id: 'doc2',
          document_name: 'Form B',
          found_value: 'CLM-002',
          location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } },
          confidence: 0.90,
        },
      ],
      expected_value: 'CLM-001',
      recommended_action: 'escalate',
      reasoning: 'Claim numbers do not match across documents',
      status: 'pending',
    };
    
    expect(() => CrossDocumentValidationSchema.parse(validation)).not.toThrow();
  });

  it('requires at least 2 documents', () => {
    const invalidValidation = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      field: 'claim_number',
      severity: 'critical',
      documents: [
        {
          document_id: 'doc1',
          document_name: 'Form A',
          found_value: 'CLM-001',
          location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } },
          confidence: 0.95,
        },
      ],
      recommended_action: 'escalate',
      reasoning: 'Only one document',
      status: 'pending',
    };
    
    expect(() => CrossDocumentValidationSchema.parse(invalidValidation)).toThrow();
  });
});

describe('DocumentCorrectionPayloadSchema', () => {
  it('validates a complete payload', () => {
    const payload = {
      schema_version: '1.0.0',
      claim: {
        claim_id: 'CLM-123',
        claim_number: 'CLM-123',
      },
      documents: [
        {
          document_id: 'doc1',
          document_name: 'Form A',
          fingerprint: 'abc123',
          corrections: [],
          annotations: [],
        },
      ],
      cross_document_validations: [],
      processed_at: new Date().toISOString(),
      processed_by: 'ai-model-v1',
      summary: {
        total_corrections: 0,
        auto_correctable: 0,
        requires_review: 0,
        cross_doc_issues: 0,
      },
    };
    
    expect(() => DocumentCorrectionPayloadSchema.parse(payload)).not.toThrow();
  });
});
