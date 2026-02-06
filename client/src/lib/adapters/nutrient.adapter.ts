import type {
  PDFProcessorAdapter,
  CorrectionResult,
  AnnotationResult,
  FormField,
} from "./pdf-processor.interface";
import type { Correction, Annotation } from "@shared/schemas";

/**
 * Nutrient Adapter - Implements PDFProcessorAdapter for Nutrient Web SDK
 */
export class NutrientAdapter implements PDFProcessorAdapter {
  private instance: any;
  private Annotations: any;
  private Geometry: any;

  async initialize(instance: any, module?: any): Promise<void> {
    this.instance = instance;
    
    if (!instance) {
      throw new Error("Cannot initialize adapter: instance is null/undefined");
    }

    // Prefer using the module directly if provided
    if (module) {
      console.log("✅ NutrientAdapter: Using provided NutrientViewer module");
      this.Annotations = module.Annotations;
      this.Geometry = module.Geometry;
    }

    // Fallback to instance if module not provided or properties missing
    if (!this.Annotations && instance.Annotations) {
      this.Annotations = await instance.Annotations;
    }
    if (!this.Geometry && instance.Geometry) {
      this.Geometry = await instance.Geometry;
    }

    // If still missing, try waiting (legacy fallback)
    if (!this.Annotations || !this.Geometry) {
      let retries = 0;
      const maxRetries = 20; // 4 seconds total
      
      while (retries < maxRetries && (!this.Annotations || !this.Geometry)) {
        try {
          if (!this.Annotations) {
            this.Annotations = await instance.Annotations;
          }
          if (!this.Geometry) {
            this.Geometry = await instance.Geometry;
          }
          
          if (this.Annotations && this.Geometry) {
            console.log(`✅ NutrientAdapter: Successfully loaded Annotations and Geometry after ${retries + 1} attempt(s)`);
            break;
          }
        } catch (err) {
          // Not ready yet
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        retries++;
      }
    }
    
    if (!this.Annotations || !this.Geometry) {
      console.warn("⚠️ NutrientAdapter: Annotations or Geometry modules not fully loaded. Some features may fail.", {
        hasAnnotations: !!this.Annotations,
        hasGeometry: !!this.Geometry
      });
    } else {
      console.log("Available annotation types:", Object.keys(this.Annotations).slice(0, 10));
    }
  }

  async dispose(): Promise<void> {
    if (this.instance?.unload) {
      await this.instance.unload();
    }
    this.instance = null;
    this.Annotations = null;
    this.Geometry = null;
  }

  async applyTextCorrection(correction: Correction): Promise<CorrectionResult> {
    // Try strategies in order based on correction type
    const strategies = this.getStrategiesForCorrection(correction);

    for (const strategy of strategies) {
      const result = await this.tryStrategy(strategy, correction);
      if (result.success) {
        return result;
      }
    }

    return {
      success: false,
      method: "content_edit",
      error: "All strategies failed",
    };
  }

  private getStrategiesForCorrection(correction: Correction): string[] {
    // Form field corrections prefer form_field strategy
    if (correction.form_field_name) {
      return ["form_field", "content_edit", "redaction_overlay"];
    }

    // Date/numeric errors may need redaction if content editing fails
    if (["date_error", "numeric_error"].includes(correction.type)) {
      return ["content_edit", "redaction_overlay"];
    }

    // Default order
    return ["content_edit", "redaction_overlay"];
  }

  private async tryStrategy(
    strategy: string,
    correction: Correction
  ): Promise<CorrectionResult> {
    try {
      switch (strategy) {
        case "form_field":
          const formSuccess = await this.tryFormFieldFix(correction);
          if (formSuccess) {
            return { success: true, method: "form_field" };
          }
          break;

        case "content_edit":
          const contentSuccess = await this.tryContentEditFix(correction);
          if (contentSuccess) {
            return { success: true, method: "content_edit" };
          }
          break;

        case "redaction_overlay":
          const redactionSuccess = await this.tryRedactionOverlay(correction);
          if (redactionSuccess) {
            return { success: true, method: "redaction_overlay" };
          }
          break;
      }
    } catch (err) {
      console.warn(`Strategy ${strategy} failed:`, err);
    }

    return { success: false, method: strategy as any, error: "Strategy failed" };
  }

  private async tryFormFieldFix(correction: Correction): Promise<boolean> {
    if (!correction.form_field_name || !correction.expected_value) {
      return false;
    }

    try {
      const formFields = await this.instance.getFormFields();
      const targetField = formFields.find(
        (f: any) => f.name === correction.form_field_name
      );

      if (!targetField) {
        return false;
      }

      await this.instance.setFormFieldValues([
        {
          name: correction.form_field_name,
          value: correction.expected_value,
        },
      ]);

      return true;
    } catch (err) {
      console.error("Form field fix failed:", err);
      return false;
    }
  }

  private async tryContentEditFix(correction: Correction): Promise<boolean> {
    if (!correction.found_value || !correction.expected_value) {
      return false;
    }

    const bbox = correction.location.bbox;
    if (!bbox) {
      return false;
    }

    try {
      const session = await this.instance.beginContentEditingSession();
      const textBlocks = await session.getTextBlocks(bbox.pageIndex);

      const targetBlock = textBlocks.find((block: any) => {
        const blockRect = block.boundingBox;
        const issueRect = {
          left: bbox.left,
          top: bbox.top,
          width: bbox.width,
          height: bbox.height,
        };

        const overlaps =
          blockRect.left < issueRect.left + issueRect.width &&
          blockRect.left + blockRect.width > issueRect.left &&
          blockRect.top < issueRect.top + issueRect.height &&
          blockRect.top + blockRect.height > issueRect.top;

        return overlaps && block.text.includes(correction.found_value);
      });

      if (!targetBlock) {
        await session.cancel();
        return false;
      }

      const updatedText = targetBlock.text.replace(
        correction.found_value,
        correction.expected_value
      );
      await session.updateTextBlocks([
        {
          id: targetBlock.id,
          text: updatedText,
        },
      ]);

      await session.commit();
      return true;
    } catch (err) {
      console.error("Content edit fix failed:", err);
      return false;
    }
  }

  private async tryRedactionOverlay(correction: Correction): Promise<boolean> {
    const bbox = correction.location.bbox;
    if (!bbox) {
      return false;
    }

    try {
      if (!this.Geometry) {
        this.Geometry = await this.instance.Geometry;
      }

      const rect = new this.Geometry.Rect({
        left: bbox.left,
        top: bbox.top,
        width: bbox.width,
        height: bbox.height,
      });

      // Create redaction overlay with expected value
      await this.instance.createRedactionOverlay({
        pageIndex: bbox.pageIndex,
        rects: [rect],
        overlayText: correction.expected_value,
      });

      return true;
    } catch (err) {
      console.error("Redaction overlay failed:", err);
      return false;
    }
  }

  async createAnnotation(annotation: Annotation): Promise<AnnotationResult> {
    const bbox = annotation.location.bbox;
    if (!bbox) {
      return {
        success: false,
        native_id: "",
        error: "No bbox location",
      };
    }

    try {
      // Ensure modules are loaded (should be done in initialize, but double check)
      if (!this.Annotations && this.instance.Annotations) {
        this.Annotations = await this.instance.Annotations;
      }
      if (!this.Geometry && this.instance.Geometry) {
        this.Geometry = await this.instance.Geometry;
      }

      if (!this.Annotations || !this.Geometry) {
        throw new Error("Annotations or Geometry module not available");
      }

      const rect = new this.Geometry.Rect({
        left: bbox.left,
        top: bbox.top,
        width: bbox.width,
        height: bbox.height,
      });

      let nativeAnnotation: any;
      const color = this.hexToColor(annotation.color || "#FFFF00");

      switch (annotation.type) {
        case "highlight":
          try {
            // Try HighlightAnnotation first (best for text)
            nativeAnnotation = new this.Annotations.HighlightAnnotation({
              pageIndex: bbox.pageIndex,
              rects: [rect],
              color: color,
            });
          } catch (e) {
            console.warn("HighlightAnnotation failed, falling back to RectangleAnnotation", e);
            // Fallback to RectangleAnnotation (works for any area)
            // Use transparent fill and colored stroke to simulate highlight
            nativeAnnotation = new this.Annotations.RectangleAnnotation({
              pageIndex: bbox.pageIndex,
              boundingBox: rect,
              strokeColor: color,
              strokeWidth: 2,
              fillColor: { r: color.r, g: color.g, b: color.b, a: 0.3 }, // Semi-transparent fill
            });
          }
          break;

        case "comment":
          nativeAnnotation = new this.Annotations.TextAnnotation({
            pageIndex: bbox.pageIndex,
            boundingBox: rect,
            text: { value: annotation.text || "" },
          });
          break;

        case "strikethrough":
          nativeAnnotation = new this.Annotations.StrikeOutAnnotation({
            pageIndex: bbox.pageIndex,
            rects: [rect],
          });
          break;

        case "underline":
          nativeAnnotation = new this.Annotations.UnderlineAnnotation({
            pageIndex: bbox.pageIndex,
            rects: [rect],
          });
          break;

        case "flag":
          nativeAnnotation = new this.Annotations.StampAnnotation({
            pageIndex: bbox.pageIndex,
            boundingBox: rect,
            stampType: "Approved", // Or custom flag type
          });
          break;

        default:
          return {
            success: false,
            native_id: "",
            error: `Unknown annotation type: ${annotation.type}`,
          };
      }

      const created = await this.instance.create(nativeAnnotation);
      return {
        success: true,
        native_id: created.id || created.uuid || String(Date.now()),
      };
    } catch (err) {
      console.error("Annotation creation failed:", err);
      return {
        success: false,
        native_id: "",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async updateAnnotation(
    id: string,
    annotation: Partial<Annotation>
  ): Promise<AnnotationResult> {
    try {
      const existing = await this.instance.getAnnotation(id);
      if (!existing) {
        return {
          success: false,
          native_id: id,
          error: "Annotation not found",
        };
      }

      // Update properties if provided
      if (annotation.text !== undefined && existing.text) {
        existing.text.value = annotation.text;
      }
      if (annotation.color !== undefined && existing.color) {
        existing.color = this.hexToColor(annotation.color);
      }

      await this.instance.update(existing);
      return {
        success: true,
        native_id: id,
        error: null,
      };
    } catch (err) {
      return {
        success: false,
        native_id: id,
        error: err instanceof Error ? err.message : "Update failed",
      };
    }
  }

  async deleteAnnotation(id: string): Promise<void> {
    try {
      await this.instance.deleteAnnotation(id);
    } catch (err) {
      console.error("Annotation deletion failed:", err);
      throw err;
    }
  }

  async getAnnotations(pageIndex?: number): Promise<Annotation[]> {
    try {
      const annotations = await this.instance.getAnnotations(pageIndex);
      // Convert Nutrient annotations to canonical format
      return annotations.map((ann: any) => this.nutrientToAnnotation(ann));
    } catch (err) {
      console.error("Failed to get annotations:", err);
      return [];
    }
  }

  async getFormFields(): Promise<FormField[]> {
    try {
      const fields = await this.instance.getFormFields();
      return fields.map((f: any) => ({
        name: f.name,
        value: f.value || "",
        type: f.type,
        required: f.required || false,
      }));
    } catch (err) {
      console.error("Failed to get form fields:", err);
      return [];
    }
  }

  async setFormFieldValue(name: string, value: string): Promise<boolean> {
    try {
      await this.instance.setFormFieldValues([{ name, value }]);
      return true;
    } catch (err) {
      console.error("Failed to set form field:", err);
      return false;
    }
  }

  supportsContentEditing(): boolean {
    return (
      this.instance &&
      typeof this.instance.beginContentEditingSession === "function"
    );
  }

  async editTextContent(
    pageIndex: number,
    textBlockId: string,
    newText: string
  ): Promise<boolean> {
    if (!this.supportsContentEditing()) {
      return false;
    }

    try {
      const session = await this.instance.beginContentEditingSession();
      await session.updateTextBlocks([{ id: textBlockId, text: newText }]);
      await session.commit();
      return true;
    } catch (err) {
      console.error("Content editing failed:", err);
      return false;
    }
  }

  async createRedactionOverlay(
    location: Correction["location"],
    overlayText: string
  ): Promise<boolean> {
    const bbox = location.bbox;
    if (!bbox) {
      return false;
    }

    try {
      if (!this.Geometry) {
        this.Geometry = await this.instance.Geometry;
      }

      const rect = new this.Geometry.Rect({
        left: bbox.left,
        top: bbox.top,
        width: bbox.width,
        height: bbox.height,
      });

      await this.instance.createRedactionOverlay({
        pageIndex: bbox.pageIndex,
        rects: [rect],
        overlayText,
      });

      return true;
    } catch (err) {
      console.error("Redaction overlay failed:", err);
      return false;
    }
  }

  async exportDocument(format: "pdf" | "pdf-a"): Promise<Blob> {
    try {
      const blob = await this.instance.export(format);
      return blob;
    } catch (err) {
      console.error("Export failed:", err);
      throw err;
    }
  }

  async getInstantJSON(): Promise<any> {
    try {
      return await this.instance.getInstantJSON();
    } catch (err) {
      console.error("Failed to get Instant JSON:", err);
      throw err;
    }
  }

  // Helper: Convert hex color to Nutrient color format
  private hexToColor(hex: string): any {
    // Nutrient expects color in format { r, g, b } or similar
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
  }

  // Helper: Convert Nutrient annotation to canonical format
  private nutrientToAnnotation(ann: any): Annotation {
    // This is a simplified conversion - adjust based on actual Nutrient annotation structure
    return {
      id: ann.id || ann.uuid || crypto.randomUUID(),
      type: this.mapNutrientAnnotationType(ann.type),
      location: {
        bbox: ann.boundingBox
          ? {
              pageIndex: ann.pageIndex || 0,
              left: ann.boundingBox.left,
              top: ann.boundingBox.top,
              width: ann.boundingBox.width,
              height: ann.boundingBox.height,
            }
          : undefined,
      },
      text: ann.text?.value || ann.text,
      color: ann.color ? this.colorToHex(ann.color) : undefined,
      created_by: ann.createdBy || "unknown",
      created_at: ann.createdAt || new Date().toISOString(),
    };
  }

  private mapNutrientAnnotationType(type: string): Annotation["type"] {
    const mapping: Record<string, Annotation["type"]> = {
      highlight: "highlight",
      text: "comment",
      strikeout: "strikethrough",
      underline: "underline",
      stamp: "flag",
    };
    return mapping[type] || "comment";
  }

  private colorToHex(color: any): string {
    if (typeof color === "string") return color;
    if (color.r !== undefined) {
      const r = Math.round(color.r * 255)
        .toString(16)
        .padStart(2, "0");
      const g = Math.round(color.g * 255)
        .toString(16)
        .padStart(2, "0");
      const b = Math.round(color.b * 255)
        .toString(16)
        .padStart(2, "0");
      return `#${r}${g}${b}`;
    }
    return "#FFFF00"; // Default yellow
  }
}
