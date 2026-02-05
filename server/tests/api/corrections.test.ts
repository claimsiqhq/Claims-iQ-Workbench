import { describe, it, expect, vi } from "vitest";

const mockStorage = {
  getCorrections: vi.fn().mockResolvedValue([
    {
      id: "corr-1",
      document_id: "doc-1",
      claim_id: "CLM-001",
      type: "typo",
      severity: "warning",
      found_value: "Jonh",
      expected_value: "John",
      status: "pending",
    },
  ]),
  createCorrection: vi.fn().mockImplementation((correction) => {
    return Promise.resolve({ ...correction, id: "new-corr-id" });
  }),
  updateCorrectionStatus: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../../storage", () => ({
  storage: mockStorage,
}));

describe("Corrections API", () => {
  describe("GET /api/documents/:documentId/corrections", () => {
    it("should return corrections for a document", async () => {
      const corrections = await mockStorage.getCorrections("doc-1");
      expect(corrections).toHaveLength(1);
      expect(corrections[0].type).toBe("typo");
    });
  });

  describe("POST /api/documents/:documentId/corrections", () => {
    it("should create a new correction", async () => {
      const newCorrection = {
        document_id: "doc-1",
        claim_id: "CLM-001",
        type: "date_error",
        severity: "critical",
        found_value: "2024-01-32",
        expected_value: "2024-01-31",
        location: { bbox: { pageIndex: 0, left: 100, top: 200, width: 50, height: 20 } },
        evidence: { source_document: "doc-1" },
      };

      const created = await mockStorage.createCorrection(newCorrection);
      expect(created.id).toBe("new-corr-id");
    });
  });

  describe("PATCH /api/corrections/:correctionId/status", () => {
    it("should update correction status", async () => {
      await mockStorage.updateCorrectionStatus("corr-1", "applied", "user-1", "auto");
      expect(mockStorage.updateCorrectionStatus).toHaveBeenCalled();
    });
  });
});
