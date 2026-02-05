import type { PDFProcessorAdapter } from "./pdf-processor.interface";
import { NutrientAdapter } from "./nutrient.adapter";

export type PDFProcessorType = "nutrient" | "pdfjs" | "custom";

/**
 * PDF Adapter Factory
 * Creates the appropriate adapter based on processor type
 */
export class PDFAdapterFactory {
  static async create(
    type: PDFProcessorType,
    instance: any
  ): Promise<PDFProcessorAdapter> {
    let adapter: PDFProcessorAdapter;

    switch (type) {
      case "nutrient":
        adapter = new NutrientAdapter();
        break;
      case "pdfjs":
        // Future: PDF.js adapter for basic viewing
        throw new Error("PDF.js adapter not implemented");
      case "custom":
        throw new Error("Custom adapter not implemented");
      default:
        throw new Error(`Unknown processor type: ${type}`);
    }

    await adapter.initialize(instance);
    return adapter;
  }
}
