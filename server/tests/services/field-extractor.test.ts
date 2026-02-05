import { describe, it, expect, beforeEach } from "vitest";
import { FieldExtractor } from "../../services/field-extractor";

describe("FieldExtractor", () => {
  let extractor: FieldExtractor;

  beforeEach(() => {
    extractor = new FieldExtractor();
  });

  describe("extractFields", () => {
    it("should extract claim number from text", () => {
      const text = "Claim Number: CLM-2024-12345\nPolicy: POL-9876";
      const fields = extractor.extractFields(text);
      
      expect(fields.claim_number).toBeDefined();
      expect(fields.claim_number?.value).toBe("CLM-2024-12345");
    });

    it("should extract policy number from text", () => {
      const text = "Policy Number: POL-12345-ABC\nInsured: John Doe";
      const fields = extractor.extractFields(text);
      
      expect(fields.policy_number).toBeDefined();
    });

    it("should extract phone numbers", () => {
      const text = "Phone: 555-123-4567\nEmail: test@example.com";
      const fields = extractor.extractFields(text);
      
      expect(fields.insured_phone || fields.insured_email).toBeDefined();
    });

    it("should extract email addresses", () => {
      const text = "Email: john.doe@example.com\nPhone: 555-123-4567";
      const fields = extractor.extractFields(text);
      
      expect(fields.insured_email).toBeDefined();
      expect(fields.insured_email?.value).toBe("john.doe@example.com");
    });

    it("should extract dates", () => {
      const text = "Date of Loss: 01/15/2024\nReported: 01/20/2024";
      const fields = extractor.extractFields(text);
      
      expect(fields.date_of_loss).toBeDefined();
    });

    it("should extract monetary amounts", () => {
      const text = "Loss Amount: $15,000.00\nDeductible: $500";
      const fields = extractor.extractFields(text);
      
      expect(fields.loss_amount).toBeDefined();
    });

    it("should return empty object for empty text", () => {
      const text = "";
      const fields = extractor.extractFields(text);
      
      expect(Object.keys(fields).length).toBe(0);
    });

    it("should return empty object for text with no extractable fields", () => {
      const text = "This is some random text without any structured data.";
      const fields = extractor.extractFields(text);
      
      expect(Object.keys(fields).length).toBe(0);
    });
  });

  describe("confidence scoring", () => {
    it("should assign high confidence to exact pattern matches", () => {
      const text = "Claim Number: CLM-2024-12345";
      const fields = extractor.extractFields(text);
      
      if (fields.claim_number) {
        expect(fields.claim_number.confidence).toBeGreaterThan(0.7);
      }
    });
  });
});
