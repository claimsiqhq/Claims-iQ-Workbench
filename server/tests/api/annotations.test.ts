import { describe, it, expect, vi } from "vitest";

const mockStorage = {
  getAnnotations: vi.fn().mockResolvedValue([
    {
      id: "ann-1",
      type: "highlight",
      location: { bbox: { pageIndex: 0, left: 10, top: 20, width: 100, height: 20 } },
      created_by: "user-1",
      created_at: new Date().toISOString(),
    },
  ]),
  createAnnotation: vi.fn().mockImplementation((annotation) => {
    return Promise.resolve({ ...annotation, id: "new-ann-id" });
  }),
  deleteAnnotation: vi.fn().mockResolvedValue(undefined),
  updateAnnotation: vi.fn().mockImplementation((id, updates) => {
    return Promise.resolve({ id, ...updates });
  }),
};

vi.mock("../../storage", () => ({
  storage: mockStorage,
}));

describe("Annotations API", () => {
  describe("GET /api/documents/:documentId/annotations", () => {
    it("should return annotations for a document", async () => {
      const annotations = await mockStorage.getAnnotations("doc-1");
      expect(annotations).toHaveLength(1);
      expect(annotations[0].type).toBe("highlight");
    });
  });

  describe("POST /api/documents/:documentId/annotations", () => {
    it("should create a new annotation", async () => {
      const newAnnotation = {
        type: "comment",
        location: { bbox: { pageIndex: 0, left: 50, top: 100, width: 80, height: 30 } },
        text: "This needs review",
        created_by: "user-1",
        created_at: new Date().toISOString(),
      };

      const created = await mockStorage.createAnnotation(newAnnotation);
      expect(created.id).toBe("new-ann-id");
    });
  });

  describe("PATCH /api/annotations/:annotationId", () => {
    it("should update an annotation", async () => {
      const updates = { text: "Updated comment" };
      const updated = await mockStorage.updateAnnotation("ann-1", updates);
      expect(updated.text).toBe("Updated comment");
    });
  });

  describe("DELETE /api/annotations/:annotationId", () => {
    it("should delete an annotation", async () => {
      await mockStorage.deleteAnnotation("ann-1");
      expect(mockStorage.deleteAnnotation).toHaveBeenCalledWith("ann-1");
    });
  });
});
