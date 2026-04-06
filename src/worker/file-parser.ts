/**
 * File parser — extracts text from common document formats.
 * Uses Node for text-based formats, Python for binary formats (PDF, DOCX, XLSX).
 */

import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve, extname } from "node:path";
import { tmpdir } from "node:os";

export interface ParseResult {
  text: string;
  format: string;
  charCount: number;
}

const SUPPORTED_EXTENSIONS = new Set([
  ".md", ".txt", ".csv", ".html", ".htm", ".json",
  ".pdf", ".docx", ".doc", ".xlsx", ".xls",
]);

export function isSupportedFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export function supportedExtensions(): string[] {
  return Array.from(SUPPORTED_EXTENSIONS);
}

/** Ensure Python parsing deps are installed. Call once at startup. */
export function ensurePythonDeps(): void {
  try {
    execSync(
      "python3 -c 'import PyPDF2, docx, openpyxl' 2>/dev/null || python3 -m pip install --break-system-packages -q pypdf2 python-docx openpyxl 2>/dev/null",
      { timeout: 120_000, stdio: "ignore" },
    );
  } catch {
    // Best effort — parsing will fail gracefully per file
  }
}

/** Parse a file and extract its text content. */
export async function parseFile(filePath: string): Promise<ParseResult> {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".md":
    case ".txt":
    case ".csv":
      return parseTextFile(filePath, ext.slice(1));

    case ".html":
    case ".htm":
      return parseHtmlFile(filePath);

    case ".json":
      return parseJsonFile(filePath);

    case ".pdf":
      return parsePdf(filePath);

    case ".docx":
    case ".doc":
      return parseDocx(filePath);

    case ".xlsx":
    case ".xls":
      return parseXlsx(filePath);

    default:
      throw new Error(`Unsupported format: ${ext}`);
  }
}

// ── Text-based formats ───────────────────────────────────

async function parseTextFile(filePath: string, format: string): Promise<ParseResult> {
  const text = await readFile(filePath, "utf-8");
  return { text, format, charCount: text.length };
}

async function parseHtmlFile(filePath: string): Promise<ParseResult> {
  const raw = await readFile(filePath, "utf-8");
  // Strip HTML tags, decode entities
  const text = raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return { text, format: "html", charCount: text.length };
}

async function parseJsonFile(filePath: string): Promise<ParseResult> {
  const raw = await readFile(filePath, "utf-8");
  try {
    const obj = JSON.parse(raw);
    const text = JSON.stringify(obj, null, 2);
    return { text, format: "json", charCount: text.length };
  } catch {
    return { text: raw, format: "json", charCount: raw.length };
  }
}

// ── Binary formats (Python) ─────────────────────────────

function runPythonScript(script: string, timeoutMs = 30_000): string {
  const tmpFile = resolve(tmpdir(), `.kb_parse_${Date.now()}.py`);
  try {
    writeFileSync(tmpFile, script, "utf-8");
    const result = execSync(`python3 "${tmpFile}"`, {
      encoding: "utf-8",
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    });
    return result;
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

function parsePdf(filePath: string): ParseResult {
  const script = `
import sys
from PyPDF2 import PdfReader

try:
    reader = PdfReader(${JSON.stringify(filePath)})
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text and text.strip():
            pages.append(text.strip())
    result = "\\n\\n".join(pages)
    print(result)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
  const text = runPythonScript(script).trim();
  return { text, format: "pdf", charCount: text.length };
}

function parseDocx(filePath: string): ParseResult {
  const script = `
import sys
from docx import Document

try:
    doc = Document(${JSON.stringify(filePath)})
    paragraphs = []
    for para in doc.paragraphs:
        if para.text.strip():
            paragraphs.append(para.text.strip())
    # Also extract tables
    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                paragraphs.append(" | ".join(cells))
    print("\\n\\n".join(paragraphs))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
  const text = runPythonScript(script).trim();
  return { text, format: "docx", charCount: text.length };
}

function parseXlsx(filePath: string): ParseResult {
  const script = `
import sys
from openpyxl import load_workbook

try:
    wb = load_workbook(${JSON.stringify(filePath)}, data_only=True)
    sheets = []
    for ws in wb.worksheets:
        rows = []
        for row in ws.iter_rows(values_only=True):
            cells = [str(c) if c is not None else "" for c in row]
            if any(c.strip() for c in cells):
                rows.append(" | ".join(c for c in cells if c.strip()))
        if rows:
            header = f"## Sheet: {ws.title}" if len(wb.worksheets) > 1 else ""
            sheets.append((header + "\\n" if header else "") + "\\n".join(rows))
    print("\\n\\n".join(sheets))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
  const text = runPythonScript(script).trim();
  return { text, format: "xlsx", charCount: text.length };
}
