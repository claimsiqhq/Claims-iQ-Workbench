import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface ExtractedClaimInfo {
  claimId?: string;
  claimNumber?: string;
  policyNumber?: string;
  insuredName?: string;
  dateOfLoss?: string;
  claimAmount?: string;
  status?: string;
  adjusterName?: string;
  [key: string]: any;
}

function convertPdfPagesToImages(pdfPath: string, maxPages: number = 3): string[] {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-pages-"));
  const outputPrefix = path.join(tmpDir, "page");

  try {
    execSync(
      `pdftoppm -png -r 200 -l ${maxPages} "${pdfPath}" "${outputPrefix}"`,
      { timeout: 30000 }
    );

    const files = fs.readdirSync(tmpDir)
      .filter(f => f.endsWith(".png"))
      .sort()
      .slice(0, maxPages);

    return files.map(f => path.join(tmpDir, f));
  } catch (error) {
    console.error("[pdf-parser] Error converting PDF to images:", error);
    return [];
  }
}

function imageToBase64(imagePath: string): string {
  const buffer = fs.readFileSync(imagePath);
  return buffer.toString("base64");
}

function cleanupImages(imagePaths: string[]): void {
  for (const p of imagePaths) {
    try { fs.unlinkSync(p); } catch {}
  }
  if (imagePaths.length > 0) {
    const dir = path.dirname(imagePaths[0]);
    try { fs.rmdirSync(dir); } catch {}
  }
}

export async function parseClaimDocument(imagePaths: string[]): Promise<ExtractedClaimInfo> {
  if (imagePaths.length === 0) {
    console.warn("[pdf-parser] No page images available, using fallback claim ID");
    return {
      claimId: `CLM-${Date.now().toString().slice(-6)}`,
      status: "Unknown",
    };
  }

  const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] = imagePaths.map(p => ({
    type: "image_url" as const,
    image_url: {
      url: `data:image/png;base64,${imageToBase64(p)}`,
      detail: "high" as const,
    },
  }));

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert at extracting structured information from insurance claim documents.
You will be given images of pages from a PDF claim document. Analyze them carefully and extract all relevant information.

Extract the following fields if present:
- claimId: The claim ID or claim number (format varies: CLM-XXX, numeric, etc.)
- claimNumber: The claim number (may be same as claimId)
- policyNumber: The policy number
- insuredName: The insured person's full name
- dateOfLoss: The date of loss (YYYY-MM-DD format)
- claimAmount: The total claim amount
- status: The claim status (open, closed, pending, etc.)
- adjusterName: The adjuster's name

Return a JSON object with the extracted fields. If a field is not found, omit it.
If you find a claim number but no explicit "Claim ID", use the claim number as claimId.
Generate a claimId in the format "CLM-XXXXXX" only if no claim identifier is found at all.

Return ONLY valid JSON, no additional text or explanation.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all claim information from these document pages:" },
            ...imageContents,
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2048,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content);

    if (!parsed.claimId && (parsed.claimNumber || parsed.policyNumber)) {
      const source = parsed.claimNumber || parsed.policyNumber || "UNKNOWN";
      const cleanSource = source.replace(/[^A-Z0-9]/gi, "").toUpperCase();
      parsed.claimId = cleanSource.substring(0, 12) || `CLM-${Date.now().toString().slice(-6)}`;
    } else if (!parsed.claimId) {
      parsed.claimId = `CLM-${Date.now().toString().slice(-6)}`;
    }

    console.log("[pdf-parser] OpenAI extracted claim info:", JSON.stringify(parsed, null, 2));
    return parsed as ExtractedClaimInfo;
  } catch (error) {
    console.error("[pdf-parser] Error parsing claim document with OpenAI:", error);
    return {
      claimId: `CLM-${Date.now().toString().slice(-6)}`,
      status: "Unknown",
    };
  }
}

export async function extractPdfText(pdfPath: string, maxPages: number = 3): Promise<string> {
  const imagePaths = convertPdfPagesToImages(pdfPath, maxPages);
  if (imagePaths.length === 0) {
    return "";
  }

  try {
    const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] = imagePaths.map(p => ({
      type: "image_url" as const,
      image_url: {
        url: `data:image/png;base64,${imageToBase64(p)}`,
        detail: "low" as const,
      },
    }));

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a document OCR assistant. Extract all visible text from the provided document page images. Return the raw text content only, preserving the original layout as much as possible.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all text from these document pages:" },
            ...imageContents,
          ],
        },
      ],
      max_tokens: 4096,
      temperature: 0,
    });

    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("[pdf-parser] Error extracting text with OpenAI:", error);
    return "";
  } finally {
    cleanupImages(imagePaths);
  }
}

export async function parsePdfFile(pdfPath: string): Promise<ExtractedClaimInfo> {
  console.log("[pdf-parser] Converting PDF pages to images for OpenAI vision analysis...");
  const imagePaths = convertPdfPagesToImages(pdfPath, 3);
  console.log(`[pdf-parser] Converted ${imagePaths.length} pages to images`);

  try {
    const result = await parseClaimDocument(imagePaths);
    return result;
  } finally {
    cleanupImages(imagePaths);
  }
}
