import type { ValidatedField, Location } from "@shared/schemas";

/**
 * Extracted Value with location and confidence
 */
export interface ExtractedValue {
  value: string;
  confidence: number;
  location: Location;
}

/**
 * Extracted Fields from a document
 */
export interface ExtractedFields {
  claim_number?: ExtractedValue;
  policy_number?: ExtractedValue;
  insured_name?: ExtractedValue;
  insured_phone?: ExtractedValue;
  insured_email?: ExtractedValue;
  date_of_loss?: ExtractedValue;
  property_address?: ExtractedValue;
  loss_amount?: ExtractedValue;
  payment_amount?: ExtractedValue;
  adjuster_name?: ExtractedValue;
  adjuster_phone?: ExtractedValue;
  coverage_type?: ExtractedValue;
  deductible?: ExtractedValue;
}

/**
 * Field Extractor Service
 * Extracts key fields from document content using pattern matching and AI
 */
export class FieldExtractor {
  /**
   * Extract fields from document content
   */
  async extractFromDocument(
    documentId: string,
    content: string | { text: string; pages: Array<{ pageIndex: number; text: string }> }
  ): Promise<ExtractedFields> {
    const text = typeof content === "string" ? content : this.extractTextFromPages(content.pages);
    
    const fields: ExtractedFields = {};

    // Pattern-based extraction for common fields
    fields.claim_number = this.extractPattern(text, CLAIM_NUMBER_PATTERNS);
    fields.policy_number = this.extractPattern(text, POLICY_NUMBER_PATTERNS);
    fields.date_of_loss = this.extractDate(text, DATE_OF_LOSS_PATTERNS);
    fields.insured_name = this.extractName(text, INSURED_NAME_PATTERNS);
    fields.insured_phone = this.extractPhone(text, PHONE_PATTERNS);
    fields.insured_email = this.extractEmail(text, EMAIL_PATTERNS);
    fields.property_address = this.extractAddress(text, ADDRESS_PATTERNS);
    fields.loss_amount = this.extractAmount(text, LOSS_AMOUNT_PATTERNS);
    fields.payment_amount = this.extractAmount(text, PAYMENT_AMOUNT_PATTERNS);
    fields.adjuster_name = this.extractName(text, ADJUSTER_NAME_PATTERNS);
    fields.adjuster_phone = this.extractPhone(text, ADJUSTER_PHONE_PATTERNS);
    fields.coverage_type = this.extractPattern(text, COVERAGE_TYPE_PATTERNS);
    fields.deductible = this.extractAmount(text, DEDUCTIBLE_PATTERNS);

    return fields;
  }

  private extractTextFromPages(pages: Array<{ pageIndex: number; text: string }>): string {
    return pages.map(p => p.text).join("\n");
  }

  private extractPattern(
    content: string,
    patterns: RegExp[]
  ): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const value = match[1] || match[0];
        return {
          value: value.trim(),
          confidence: 0.85,
          location: this.findLocationInText(content, match[0]),
        };
      }
    }
    return null;
  }

  private extractDate(
    content: string,
    patterns: RegExp[]
  ): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const dateStr = match[1] || match[0];
        // Validate date format
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return {
            value: dateStr.trim(),
            confidence: 0.80,
            location: this.findLocationInText(content, match[0]),
          };
        }
      }
    }
    return null;
  }

  private extractName(
    content: string,
    patterns: RegExp[]
  ): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const name = match[1] || match[0];
        // Basic validation: name should have at least 2 words
        const words = name.trim().split(/\s+/);
        if (words.length >= 2) {
          return {
            value: name.trim(),
            confidence: 0.75,
            location: this.findLocationInText(content, match[0]),
          };
        }
      }
    }
    return null;
  }

  private extractPhone(
    content: string,
    patterns: RegExp[]
  ): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const phone = match[1] || match[0];
        // Normalize phone number
        const normalized = phone.replace(/\D/g, "");
        if (normalized.length >= 10) {
          return {
            value: phone.trim(),
            confidence: 0.85,
            location: this.findLocationInText(content, match[0]),
          };
        }
      }
    }
    return null;
  }

  private extractEmail(
    content: string,
    patterns: RegExp[]
  ): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const email = match[1] || match[0];
        if (email.includes("@") && email.includes(".")) {
          return {
            value: email.trim(),
            confidence: 0.90,
            location: this.findLocationInText(content, match[0]),
          };
        }
      }
    }
    return null;
  }

  private extractAddress(
    content: string,
    patterns: RegExp[]
  ): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const address = match[1] || match[0];
        // Basic validation: address should have street number and name
        if (/\d/.test(address) && /[A-Za-z]/.test(address)) {
          return {
            value: address.trim(),
            confidence: 0.70,
            location: this.findLocationInText(content, match[0]),
          };
        }
      }
    }
    return null;
  }

  private extractAmount(
    content: string,
    patterns: RegExp[]
  ): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const amountStr = match[1] || match[0];
        // Extract numeric value
        const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ""));
        if (!isNaN(amount) && amount > 0) {
          return {
            value: amountStr.trim(),
            confidence: 0.85,
            location: this.findLocationInText(content, match[0]),
          };
        }
      }
    }
    return null;
  }

  /**
   * Find approximate location of text in document
   * This is a simplified implementation - in production, use actual PDF coordinates
   */
  private findLocationInText(content: string, text: string): Location {
    const index = content.indexOf(text);
    const lines = content.substring(0, index).split("\n");
    const lineNumber = lines.length - 1;
    
    // Estimate page (assuming ~50 lines per page)
    const estimatedPage = Math.floor(lineNumber / 50);
    
    return {
      search_text: {
        text: text.substring(0, 50), // First 50 chars for search
        occurrence: 1,
      },
    };
  }
}

// Pattern definitions for field extraction

const CLAIM_NUMBER_PATTERNS = [
  /claim\s*(?:number|#|id|ID)[\s:]*([A-Z0-9-]+)/i,
  /(?:claim|CLM)[\s-]*([0-9]{6,})/i,
  /CLM[-_]?([A-Z0-9]+)/i,
];

const POLICY_NUMBER_PATTERNS = [
  /policy\s*(?:number|#|id|ID)[\s:]*([A-Z0-9-]+)/i,
  /(?:policy|POL)[\s-]*([0-9]{6,})/i,
];

const DATE_OF_LOSS_PATTERNS = [
  /date\s*of\s*loss[\s:]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
  /loss\s*date[\s:]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
  /(?:occurred|incident)\s*on[\s:]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
];

const INSURED_NAME_PATTERNS = [
  /insured\s*(?:name|party)[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
  /(?:name\s*of\s*insured|insured)[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
];

const PHONE_PATTERNS = [
  /phone[\s:]*\(?([0-9]{3})\)?[\s-]?([0-9]{3})[\s-]?([0-9]{4})/,
  /tel[\s:]*([0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{4})/i,
];

const EMAIL_PATTERNS = [
  /email[\s:]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
  /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
];

const ADDRESS_PATTERNS = [
  /address[\s:]*([0-9]+\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Place|Pl)[\s,]+[A-Za-z\s,]+[0-9]{5})/i,
  /([0-9]+\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr)[\s,]+[A-Za-z\s,]+[0-9]{5})/i,
];

const LOSS_AMOUNT_PATTERNS = [
  /loss\s*amount[\s:]*\$?\s*([0-9,]+\.?[0-9]*)/i,
  /(?:total\s*)?loss[\s:]*\$?\s*([0-9,]+\.?[0-9]*)/i,
];

const PAYMENT_AMOUNT_PATTERNS = [
  /payment\s*amount[\s:]*\$?\s*([0-9,]+\.?[0-9]*)/i,
  /(?:total\s*)?payment[\s:]*\$?\s*([0-9,]+\.?[0-9]*)/i,
];

const ADJUSTER_NAME_PATTERNS = [
  /adjuster[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
  /(?:assigned\s*)?adjuster[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
];

const ADJUSTER_PHONE_PATTERNS = [
  /adjuster\s*phone[\s:]*\(?([0-9]{3})\)?[\s-]?([0-9]{3})[\s-]?([0-9]{4})/i,
];

const COVERAGE_TYPE_PATTERNS = [
  /coverage\s*type[\s:]*([A-Za-z\s]+)/i,
  /(?:type\s*of\s*)?coverage[\s:]*([A-Za-z\s]+)/i,
];

const DEDUCTIBLE_PATTERNS = [
  /deductible[\s:]*\$?\s*([0-9,]+\.?[0-9]*)/i,
];
