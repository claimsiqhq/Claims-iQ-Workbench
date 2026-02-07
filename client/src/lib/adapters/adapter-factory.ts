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
    instance: any,
    module?: any
  ): Promise<PDFProcessorAdapter> {
    let adapter: PDFProcessorAdapter;

    switch (type) {
      case "nutrient":
        adapter = new NutrientAdapter();
        break;
      case "pdfjs":
      case "custom":
        console.warn(`Unsupported PDF processor type "${type}", falling back to Nutrient adapter.`);
        adapter = new NutrientAdapter();
        break;
      default:
        console.warn(`Unknown PDF processor type "${type}", falling back to Nutrient adapter.`);
        adapter = new NutrientAdapter();
        break;
    }

    await adapter.initialize(instance, module);
    return adapter;
  }
}
