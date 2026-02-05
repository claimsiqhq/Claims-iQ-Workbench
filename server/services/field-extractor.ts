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
   * Synchronous field extraction from text content
   */
  extractFields(content: string): ExtractedFields {
    const fields: ExtractedFields = {};

    fields.claim_number = this.extractPatternSync(content, CLAIM_NUMBER_PATTERNS);
    fields.policy_number = this.extractPatternSync(content, POLICY_NUMBER_PATTERNS);
    fields.date_of_loss = this.extractDateSync(content, DATE_OF_LOSS_PATTERNS);
    fields.insured_name = this.extractNameSync(content, INSURED_NAME_PATTERNS);
    fields.insured_phone = this.extractPhoneSync(content, PHONE_PATTERNS);
    fields.insured_email = this.extractEmailSync(content, EMAIL_PATTERNS);
    fields.property_address = this.extractAddressSync(content, ADDRESS_PATTERNS);
    fields.loss_amount = this.extractAmountSync(content, LOSS_AMOUNT_PATTERNS);
    fields.payment_amount = this.extractAmountSync(content, PAYMENT_AMOUNT_PATTERNS);
    fields.adjuster_name = this.extractNameSync(content, ADJUSTER_NAME_PATTERNS);
    fields.adjuster_phone = this.extractPhoneSync(content, ADJUSTER_PHONE_PATTERNS);
    fields.coverage_type = this.extractPatternSync(content, COVERAGE_TYPE_PATTERNS);
    fields.deductible = this.extractAmountSync(content, DEDUCTIBLE_PATTERNS);

    const result: ExtractedFields = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== null) {
        result[key as keyof ExtractedFields] = value;
      }
    }
    return result;
  }

  /**
   * Extract fields from document content (async version)
   */
  async extractFromDocument(
    documentId: string,
    content: string | { text: string; pages: Array<{ pageIndex: number; text: string }> }
  ): Promise<ExtractedFields> {
    const text = typeof content === "string" ? content : this.extractTextFromPages(content.pages);
    return this.extractFields(text);
  }

  private extractTextFromPages(pages: Array<{ pageIndex: number; text: string }>): string {
    return pages.map(p => p.text).join("\n");
  }

  private extractPatternSync(content: string, patterns: RegExp[]): ExtractedValue | null {
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

  private extractDateSync(content: string, patterns: RegExp[]): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const dateStr = match[1] || match[0];
        return {
          value: dateStr.trim(),
          confidence: 0.80,
          location: this.findLocationInText(content, match[0]),
        };
      }
    }
    return null;
  }

  private extractNameSync(content: string, patterns: RegExp[]): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const name = match[1] || match[0];
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

  private extractPhoneSync(content: string, patterns: RegExp[]): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const phone = match[1] || match[0];
        const normalized = phone.replace(/\D/g, "");
        if (normalized.length >= 3) {
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

  private extractEmailSync(content: string, patterns: RegExp[]): ExtractedValue | null {
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

  private extractAddressSync(content: string, patterns: RegExp[]): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const address = match[1] || match[0];
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

  private extractAmountSync(content: string, patterns: RegExp[]): ExtractedValue | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const amountStr = match[1] || match[0];
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
