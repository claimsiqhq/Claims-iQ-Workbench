import fs from "fs";
import path from "path";

type Violation = {
  file: string;
  line: number;
  message: string;
};

const root = path.resolve(process.cwd(), "client", "src");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

function findLineNumber(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

const violations: Violation[] = [];

for (const file of walk(root)) {
  const content = fs.readFileSync(file, "utf-8");

  const imgRegex = /<img\b[^>]*>/g;
  let match: RegExpExecArray | null = null;
  while ((match = imgRegex.exec(content))) {
    const tag = match[0];
    if (!/\balt\s*=/.test(tag)) {
      violations.push({
        file,
        line: findLineNumber(content, match.index),
        message: "Missing alt attribute on <img> tag.",
      });
    }
  }

  const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  while ((match = buttonRegex.exec(content))) {
    const attrs = match[1];
    const inner = match[2];
    const hasAria = /aria-label|aria-labelledby/.test(attrs);
    const textContent = inner
      .replace(/<[^>]+>/g, "")
      .replace(/\{[^}]+\}/g, "")
      .trim();

    if (!hasAria && textContent.length === 0) {
      violations.push({
        file,
        line: findLineNumber(content, match.index),
        message: "Button appears to have no accessible label.",
      });
    }
  }
}

if (violations.length > 0) {
  console.error("Accessibility check failed with the following issues:");
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.message}`);
  }
  process.exit(1);
}

console.log("Accessibility check passed.");
