import { describe, it, expect, beforeEach } from "vitest";
import { CrossDocumentValidator, type ExtractedDocument } from "../../services/cross-document-validator";

describe("CrossDocumentValidator", () => {
  let validator: CrossDocumentValidator;

  beforeEach(() => {
    validator = new CrossDocumentValidator();
  });

  describe("validateClaim", () => {
    it("should detect inconsistent values across documents", async () => {
      const documents: ExtractedDocument[] = [
        {
          document_id: "doc1",
          document_name: "FNOL Form",
          fields: {
            claim_number: { value: "CLM-2024-001", confidence: 0.9, location: { search_text: { text: "CLM-2024-001", occurrence: 1 } } },
            insured_name: { value: "John Doe", confidence: 0.8, location: { search_text: { text: "John Doe", occurrence: 1 } } },
          },
        },
        {
          document_id: "doc2",
          document_name: "Invoice",
          fields: {
            claim_number: { value: "CLM-2024-001", confidence: 0.9, location: { search_text: { text: "CLM-2024-001", occurrence: 1 } } },
            insured_name: { value: "Jon Doe", confidence: 0.8, location: { search_text: { text: "Jon Doe", occurrence: 1 } } },
          },
        },
      ];

      const validations = await validator.validateClaim("claim-123", documents);

      const nameValidation = validations.find((v) => v.field === "insured_name");
      expect(nameValidation).toBeDefined();
    });

    it("should not flag matching values", async () => {
      const documents: ExtractedDocument[] = [
        {
          document_id: "doc1",
          document_name: "FNOL Form",
          fields: {
            claim_number: { value: "CLM-2024-001", confidence: 0.9, location: { search_text: { text: "CLM-2024-001", occurrence: 1 } } },
          },
        },
        {
          document_id: "doc2",
          document_name: "Invoice",
          fields: {
            claim_number: { value: "CLM-2024-001", confidence: 0.9, location: { search_text: { text: "CLM-2024-001", occurrence: 1 } } },
          },
        },
      ];

      const validations = await validator.validateClaim("claim-123", documents);

      expect(validations.length).toBe(0);
    });

    it("should assign critical severity to mismatched claim numbers", async () => {
      const documents: ExtractedDocument[] = [
        {
          document_id: "doc1",
          document_name: "FNOL Form",
          fields: {
            claim_number: { value: "CLM-2024-001", confidence: 0.9, location: { search_text: { text: "CLM-2024-001", occurrence: 1 } } },
          },
        },
        {
          document_id: "doc2",
          document_name: "Invoice",
          fields: {
            claim_number: { value: "CLM-2024-002", confidence: 0.9, location: { search_text: { text: "CLM-2024-002", occurrence: 1 } } },
          },
        },
      ];

      const validations = await validator.validateClaim("claim-123", documents);

      const claimNumberValidation = validations.find((v) => v.field === "claim_number");
      expect(claimNumberValidation?.severity).toBe("critical");
    });

    it("should handle single document", async () => {
      const documents: ExtractedDocument[] = [
        {
          document_id: "doc1",
          document_name: "FNOL Form",
          fields: {
            claim_number: { value: "CLM-2024-001", confidence: 0.9, location: { search_text: { text: "CLM-2024-001", occurrence: 1 } } },
          },
        },
      ];

      const validations = await validator.validateClaim("claim-123", documents);

      expect(validations.length).toBe(0);
    });

    it("should handle empty documents array", async () => {
      const validations = await validator.validateClaim("claim-123", []);
      expect(validations.length).toBe(0);
    });
  });
});
