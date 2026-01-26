import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

import OpenAI from "openai";
import fs from "fs";
import path from "path";

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export interface ExtractedClaimInfo {
  claimId?: string;
  claimNumber?: string;
  policyNumber?: string;
  insuredName?: string;
  dateOfLoss?: string;
  claimAmount?: string;
  status?: string;
  adjusterName?: string;
  [key: string]: any; // Allow additional fields
}

/**
 * Extract text from the first N pages of a PDF
 */
export async function extractPdfText(pdfPath: string, maxPages: number = 3): Promise<string> {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);
  
  // If PDF has fewer pages than maxPages, return all text
  // Otherwise, we need to extract text from first pages only
  // Note: pdf-parse doesn't support page-by-page extraction easily,
  // so we'll extract all and let OpenAI handle it, or limit the text length
  const fullText = data.text;
  
  // Approximate: split by pages (if we can detect page breaks)
  // For now, take first ~5000 characters which should cover first few pages
  const textLength = Math.min(fullText.length, maxPages * 2000);
  return fullText.substring(0, textLength);
}

/**
 * Parse PDF text with OpenAI to extract structured claim information
 */
export async function parseClaimDocument(pdfText: string): Promise<ExtractedClaimInfo> {
  const openai = getOpenAI();
  if (!openai) {
    console.warn("OPENAI_API_KEY not set, using fallback claim ID generation");
    // Return fallback with generated claim ID
    return {
      claimId: `CLM-${Date.now().toString().slice(-6)}`,
      status: "Unknown",
    };
  }

  const prompt = `You are an expert at extracting structured information from insurance claim documents. 
Analyze the following text extracted from the first few pages of a claim document and extract all relevant information.

Extract the following fields if present:
- claimId or Claim ID (format: CLM-XXX, CLM-XXXX, or similar)
- claimNumber or Claim Number
- policyNumber or Policy Number
- insuredName or Insured Name
- dateOfLoss or Date of Loss
- claimAmount or Claim Amount
- status or Claim Status
- adjusterName or Adjuster Name
- Any other relevant claim information

Return a JSON object with the extracted fields. If a field is not found, omit it from the response.
Generate a claimId in the format "CLM-XXX" if one is not found but other claim information exists.

Text to analyze:
${pdfText.substring(0, 8000)} // Limit to avoid token limits

Return ONLY valid JSON, no additional text or explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using mini for cost efficiency
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that extracts structured data from insurance claim documents. Always return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for consistent extraction
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content);
    
    // Ensure we have a claimId - generate one if missing
    if (!parsed.claimId && (parsed.claimNumber || parsed.policyNumber)) {
      // Generate claim ID from claim number or policy number
      const source = parsed.claimNumber || parsed.policyNumber || "UNKNOWN";
      const cleanSource = source.replace(/[^A-Z0-9]/g, "").toUpperCase();
      parsed.claimId = `CLM-${cleanSource.substring(0, 6)}`;
    } else if (!parsed.claimId) {
      // Fallback: generate from timestamp
      parsed.claimId = `CLM-${Date.now().toString().slice(-6)}`;
    }

    return parsed as ExtractedClaimInfo;
  } catch (error) {
    console.error("Error parsing claim document with OpenAI:", error);
    // Return a fallback with generated claim ID
    return {
      claimId: `CLM-${Date.now().toString().slice(-6)}`,
      status: "Unknown",
    };
  }
}

/**
 * Parse a PDF file and extract claim information
 */
export async function parsePdfFile(pdfPath: string): Promise<ExtractedClaimInfo> {
  const text = await extractPdfText(pdfPath, 3); // Extract first 3 pages
  return await parseClaimDocument(text);
}
