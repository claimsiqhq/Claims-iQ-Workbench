import { randomUUID } from "crypto";
import type {
  ValidatedField,
  CrossDocumentValidation,
  Severity,
  RecommendedAction,
} from "@shared/schemas";
import type { ExtractedFields, ExtractedValue } from "./field-extractor";

/**
 * Extracted Document with fields
 */
export interface ExtractedDocument {
  document_id: string;
  document_name: string;
  fields: ExtractedFields;
}

/**
 * Cross-Document Validator
 * Detects inconsistencies across multiple documents in a claim
 */
export class CrossDocumentValidator {
  /**
   * Validate a claim by comparing fields across documents
   */
  async validateClaim(
    claimId: string,
    documents: ExtractedDocument[]
  ): Promise<CrossDocumentValidation[]> {
    const validations: CrossDocumentValidation[] = [];

    // Get all validated fields
    const validatedFields: ValidatedField[] = [
      "claim_number",
      "policy_number",
      "insured_name",
      "insured_phone",
      "insured_email",
      "date_of_loss",
      "property_address",
      "loss_amount",
      "payment_amount",
      "adjuster_name",
      "adjuster_phone",
      "coverage_type",
      "deductible",
    ];

    for (const field of validatedFields) {
      const values = this.extractFieldFromDocuments(field, documents);

      if (values.length < 2) {
        continue; // Need at least 2 docs to compare
      }

      const uniqueValues = new Set(
        values.map((v) => this.normalizeValue(v.value))
      );

      if (uniqueValues.size > 1) {
        // Inconsistency detected
        validations.push({
          id: randomUUID(),
          claim_id: claimId,
          field,
          severity: this.getSeverityForField(field),
          documents: values.map((v) => ({
            document_id: v.document_id,
            document_name: v.document_name,
            found_value: v.value,
            location: v.location,
            confidence: v.confidence,
          })),
          expected_value: this.determineExpectedValue(values),
          recommended_action: this.determineAction(field, values),
          reasoning: this.generateReasoning(field, values),
          status: "pending",
        });
      }
    }

    return validations;
  }

  /**
   * Extract a field value from all documents
   */
  private extractFieldFromDocuments(
    field: ValidatedField,
    documents: ExtractedDocument[]
  ): Array<ExtractedValue & { document_id: string; document_name: string }> {
    const results: Array<
      ExtractedValue & { document_id: string; document_name: string }
    > = [];

    for (const doc of documents) {
      const fieldValue = doc.fields[field];
      if (fieldValue) {
        results.push({
          ...fieldValue,
          document_id: doc.document_id,
          document_name: doc.document_name,
        });
      }
    }

    return results;
  }

  /**
   * Normalize a value for comparison
   */
  private normalizeValue(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "") // Remove punctuation/spaces
      .replace(/\s+/g, " "); // Normalize whitespace
  }

  /**
   * Get severity level for a field
   */
  private getSeverityForField(field: ValidatedField): Severity {
    const criticalFields: ValidatedField[] = [
      "claim_number",
      "policy_number",
      "loss_amount",
    ];
    const warningFields: ValidatedField[] = [
      "insured_name",
      "date_of_loss",
      "property_address",
      "payment_amount",
    ];

    if (criticalFields.includes(field)) return "critical";
    if (warningFields.includes(field)) return "warning";
    return "info";
  }

  /**
   * Determine expected value (most common or highest confidence)
   */
  private determineExpectedValue(
    values: Array<ExtractedValue & { document_id: string; document_name: string }>
  ): string {
    // Strategy 1: Use value with highest confidence
    const highestConfidence = values.reduce((prev, curr) =>
      curr.confidence > prev.confidence ? curr : prev
    );

    // Strategy 2: Use most common normalized value
    const normalizedCounts = new Map<string, { count: number; value: string }>();
    for (const v of values) {
      const normalized = this.normalizeValue(v.value);
      const existing = normalizedCounts.get(normalized);
      if (existing) {
        existing.count++;
      } else {
        normalizedCounts.set(normalized, { count: 1, value: v.value });
      }
    }

    const mostCommon = Array.from(normalizedCounts.values()).reduce((prev, curr) =>
      curr.count > prev.count ? curr : prev
    );

    // Prefer highest confidence if it's close, otherwise most common
    if (highestConfidence.confidence > 0.9) {
      return highestConfidence.value;
    }

    return mostCommon.value;
  }

  /**
   * Determine recommended action based on field and values
   */
  private determineAction(
    field: ValidatedField,
    values: Array<ExtractedValue & { document_id: string; document_name: string }>
  ): RecommendedAction {
    const avgConfidence =
      values.reduce((sum, v) => sum + v.confidence, 0) / values.length;

    // High confidence + non-critical = auto_correct
    if (avgConfidence > 0.9 && this.getSeverityForField(field) !== "critical") {
      return "auto_correct";
    }

    // Large discrepancies in amounts = escalate
    if (field === "loss_amount" || field === "payment_amount") {
      const amounts = values.map((v) =>
        parseFloat(v.value.replace(/[^0-9.]/g, ""))
      );
      const variance = this.calculateVariance(amounts);
      if (variance > 0.2) {
        return "escalate";
      }
    }

    // Critical fields with inconsistencies = escalate
    if (this.getSeverityForField(field) === "critical") {
      return "escalate";
    }

    return "flag_for_review";
  }

  /**
   * Calculate variance in numeric values
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      values.length;
    const stdDev = Math.sqrt(variance);

    return mean > 0 ? stdDev / mean : 0; // Coefficient of variation
  }

  /**
   * Generate human-readable reasoning for the validation
   */
  private generateReasoning(
    field: ValidatedField,
    values: Array<ExtractedValue & { document_id: string; document_name: string }>
  ): string {
    const uniqueValues = Array.from(
      new Set(values.map((v) => this.normalizeValue(v.value)))
    );

    if (uniqueValues.length === values.length) {
      return `All ${values.length} documents have different values for ${field}.`;
    }

    const valueCounts = new Map<string, number>();
    for (const v of values) {
      const normalized = this.normalizeValue(v.value);
      valueCounts.set(normalized, (valueCounts.get(normalized) || 0) + 1);
    }

    const mostCommon = Array.from(valueCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0];

    return `${mostCommon[1]} of ${values.length} documents have the value "${mostCommon[0]}" for ${field}, but ${values.length - mostCommon[1]} document(s) have different values.`;
  }
}
