import { describe, it, expect } from 'vitest';
import { FieldExtractor } from '../server/services/field-extractor';
import { CrossDocumentValidator, type ExtractedDocument } from '../server/services/cross-document-validator';

describe('CrossDocumentValidator', () => {
  it('detects claim number inconsistency', async () => {
    const validator = new CrossDocumentValidator();
    
    const documents: ExtractedDocument[] = [
      {
        document_id: 'doc1',
        document_name: 'FNOL Form',
        fields: {
          claim_number: { 
            value: 'CLM-001', 
            confidence: 0.95, 
            location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } } 
          },
        },
      },
      {
        document_id: 'doc2',
        document_name: 'Invoice',
        fields: {
          claim_number: { 
            value: 'CLM-002', 
            confidence: 0.90, 
            location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } } 
          },
        },
      },
    ];
    
    const validations = await validator.validateClaim('claim-123', documents);
    
    expect(validations.length).toBe(1);
    expect(validations[0].field).toBe('claim_number');
    expect(validations[0].severity).toBe('critical');
    expect(validations[0].recommended_action).toBe('escalate'); // Critical field
  });
  
  it('returns no validations when all values match', async () => {
    const validator = new CrossDocumentValidator();
    
    const documents: ExtractedDocument[] = [
      {
        document_id: 'doc1',
        document_name: 'FNOL Form',
        fields: {
          claim_number: { 
            value: 'CLM-001', 
            confidence: 0.95, 
            location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } } 
          },
        },
      },
      {
        document_id: 'doc2',
        document_name: 'Invoice',
        fields: {
          claim_number: { 
            value: 'CLM-001', 
            confidence: 0.90, 
            location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } } 
          },
        },
      },
    ];
    
    const validations = await validator.validateClaim('claim-123', documents);
    
    expect(validations.length).toBe(0);
  });

  it('requires at least 2 documents to validate', async () => {
    const validator = new CrossDocumentValidator();
    
    const documents: ExtractedDocument[] = [
      {
        document_id: 'doc1',
        document_name: 'FNOL Form',
        fields: {
          claim_number: { 
            value: 'CLM-001', 
            confidence: 0.95, 
            location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } } 
          },
        },
      },
    ];
    
    const validations = await validator.validateClaim('claim-123', documents);
    
    expect(validations.length).toBe(0);
  });

  it('detects amount variance and escalates', async () => {
    const validator = new CrossDocumentValidator();
    
    const documents: ExtractedDocument[] = [
      {
        document_id: 'doc1',
        document_name: 'Estimate',
        fields: {
          loss_amount: { 
            value: '$10,000', 
            confidence: 0.95, 
            location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } } 
          },
        },
      },
      {
        document_id: 'doc2',
        document_name: 'Invoice',
        fields: {
          loss_amount: { 
            value: '$15,000', 
            confidence: 0.90, 
            location: { bbox: { pageIndex: 0, left: 0, top: 0, width: 100, height: 20 } } 
          },
        },
      },
    ];
    
    const validations = await validator.validateClaim('claim-123', documents);
    
    expect(validations.length).toBe(1);
    expect(validations[0].field).toBe('loss_amount');
    expect(validations[0].recommended_action).toBe('escalate'); // Large variance
  });
});

describe('FieldExtractor', () => {
  it('extracts claim number from text', async () => {
    const extractor = new FieldExtractor();
    
    const content = 'Claim Number: CLM-12345';
    const fields = await extractor.extractFromDocument('doc1', content);
    
    expect(fields.claim_number).toBeDefined();
    expect(fields.claim_number?.value).toContain('CLM');
  });

  it('extracts date of loss', async () => {
    const extractor = new FieldExtractor();
    
    const content = 'Date of Loss: 01/15/2024';
    const fields = await extractor.extractFromDocument('doc1', content);
    
    expect(fields.date_of_loss).toBeDefined();
    expect(fields.date_of_loss?.value).toMatch(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/);
  });

  it('extracts email addresses', async () => {
    const extractor = new FieldExtractor();
    
    const content = 'Email: john.doe@example.com';
    const fields = await extractor.extractFromDocument('doc1', content);
    
    expect(fields.insured_email).toBeDefined();
    expect(fields.insured_email?.value).toContain('@');
  });
});
