import type { Location, BBox } from "@shared/schemas";

/**
 * Resolved Location - Result of location resolution
 */
export interface ResolvedLocation {
  type: "bbox" | "search_text";
  bbox: BBox;
}

/**
 * Location Resolver
 * Implements dual location strategy: tries bbox first, falls back to search_text
 */
export class LocationResolver {
  constructor(private pdfInstance: any) {}

  /**
   * Resolve a location using dual strategy
   * 1. Try bbox first (most precise)
   * 2. Fallback to search_text if bbox fails or is missing
   */
  async resolveLocation(location: Location): Promise<ResolvedLocation | null> {
    // Try bbox first (most precise)
    if (location.bbox) {
      const verified = await this.verifyBbox(location.bbox);
      if (verified) {
        return { type: "bbox", bbox: location.bbox };
      }
    }

    // Fallback to search_text
    if (location.search_text) {
      const found = await this.findBySearchText(location.search_text);
      if (found) {
        return { type: "search_text", bbox: found };
      }
    }

    return null;
  }

  /**
   * Verify that a bbox is still valid (content hasn't shifted)
   */
  private async verifyBbox(bbox: BBox): Promise<boolean> {
    try {
      // Check if there's content at this location
      // This is a simplified check - adjust based on PDF processor capabilities
      if (this.pdfInstance?.getTextAtLocation) {
        const text = await this.pdfInstance.getTextAtLocation({
          pageIndex: bbox.pageIndex,
          left: bbox.left,
          top: bbox.top,
          width: bbox.width,
          height: bbox.height,
        });
        return text && text.length > 0;
      }

      // If verification not available, assume valid
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find location by searching for text
   */
  private async findBySearchText(searchText: Location["search_text"]): Promise<BBox | null> {
    if (!searchText) return null;

    try {
      // Use PDF processor's search capability
      let results: any = [];

      if (this.pdfInstance?.search) {
        results = await this.pdfInstance.search(searchText.text);
      } else if (this.pdfInstance?.findText) {
        results = await this.pdfInstance.findText(searchText.text);
      } else {
        console.warn("PDF instance does not support text search");
        return null;
      }

      const normalizedResults = this.normalizeSearchResults(results);
      if (normalizedResults.length === 0) {
        return null;
      }

      // Get the specified occurrence (default to first)
      const targetIndex = (searchText.occurrence || 1) - 1;
      if (targetIndex >= normalizedResults.length) {
        return null;
      }

      const result = normalizedResults[targetIndex];

      // Verify context if provided
      if (searchText.context_before || searchText.context_after) {
        const verified = await this.verifyContext(
          result,
          searchText.context_before,
          searchText.context_after
        );
        if (!verified) {
          return null;
        }
      }

      // Convert result to BBox format
      return {
        pageIndex: result.pageIndex || result.page || 0,
        left: result.rect?.left || result.left || result.x || 0,
        top: result.rect?.top || result.top || result.y || 0,
        width: result.rect?.width || result.width || 0,
        height: result.rect?.height || result.height || 0,
      };
    } catch (err) {
      console.error("Search text resolution failed:", err);
      return null;
    }
  }

  /**
   * Verify that the found text matches the expected context
   */
  private async verifyContext(
    result: any,
    contextBefore?: string,
    contextAfter?: string
  ): Promise<boolean> {
    try {
      // Get surrounding text to verify context
      if (!this.pdfInstance?.getTextAtLocation) {
        // If context verification not available, assume valid
        return true;
      }

      const pageIndex = result.pageIndex || result.page || 0;
      const rect = result.rect || result;

      // Check before context
      if (contextBefore) {
        const beforeRect = {
          pageIndex,
          left: Math.max(0, rect.left - 200),
          top: rect.top,
          width: 200,
          height: rect.height,
        };
        const beforeText = await this.pdfInstance.getTextAtLocation(beforeRect);
        if (!beforeText?.includes(contextBefore)) {
          return false;
        }
      }

      // Check after context
      if (contextAfter) {
        const afterRect = {
          pageIndex,
          left: rect.left + rect.width,
          top: rect.top,
          width: 200,
          height: rect.height,
        };
        const afterText = await this.pdfInstance.getTextAtLocation(afterRect);
        if (!afterText?.includes(contextAfter)) {
          return false;
        }
      }

      return true;
    } catch {
      // If verification fails, assume valid (fail open)
      return true;
    }
  }

  private normalizeSearchResults(results: any): any[] {
    if (!results) return [];
    if (Array.isArray(results)) return results;
    if (typeof results.toArray === "function") {
      return results.toArray();
    }
    if (typeof results.size === "number" && typeof results.get === "function") {
      const normalized: any[] = [];
      for (let i = 0; i < results.size; i++) {
        normalized.push(results.get(i));
      }
      return normalized;
    }
    return [];
  }
}
