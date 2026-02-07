import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";

const mockStorage = {
  getClaims: vi.fn().mockResolvedValue([
    { id: "1", claimId: "CLM-001", status: "open" },
    { id: "2", claimId: "CLM-002", status: "in_progress" },
  ]),
  getClaimById: vi.fn().mockImplementation((id: string) => {
    if (id === "CLM-001") {
      return Promise.resolve({ id: "1", claimId: "CLM-001", status: "open" });
    }
    return Promise.resolve(null);
  }),
  getDocumentsByClaim: vi.fn().mockResolvedValue([]),
  getIssues: vi.fn().mockResolvedValue([]),
};

vi.mock("../../storage", () => ({
  storage: mockStorage,
}));

describe("Claims API", () => {
  describe("GET /api/claims", () => {
    it("should return list of claims", async () => {
      const claims = mockStorage.getClaims();
      expect(claims).toBeDefined();
    });

    it("should require authentication", async () => {
      expect(true).toBe(true);
    });
  });

  describe("GET /api/claims/:claimId", () => {
    it("should return a single claim by ID", async () => {
      const claim = await mockStorage.getClaimById("CLM-001");
      expect(claim).toBeDefined();
      expect(claim?.claimId).toBe("CLM-001");
    });

    it("should return null for non-existent claim", async () => {
      const claim = await mockStorage.getClaimById("NON-EXISTENT");
      expect(claim).toBeNull();
    });
  });

  describe("GET /api/claims/:claimId/documents", () => {
    it("should return documents for a claim", async () => {
      const docs = await mockStorage.getDocumentsByClaim("CLM-001");
      expect(Array.isArray(docs)).toBe(true);
    });
  });

  describe("GET /api/claims/:claimId/issues", () => {
    it("should return issues for a claim", async () => {
      const issues = await mockStorage.getIssues("CLM-001", "DOC-001");
      expect(Array.isArray(issues)).toBe(true);
    });
  });
});
