import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Locates the locally generated fallback PDF used by the resume-import tests.
 * Returns null when unavailable (tests then skip PDF assertions).
 */
export function findTestPdfPath(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../tests/fixtures/sample-resume.pdf'),
    path.resolve(__dirname, '../../../../apps/api/tests/fixtures/sample-resume.pdf'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Extracts plain text from a PDF buffer using pdf-parse v2 (PDFParse class).
 * Throws a descriptive error when extraction fails so callers can degrade
 * gracefully to the paste-text flow.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const mod: any = await import('pdf-parse');
  const PDFParse = mod.PDFParse || mod.default?.PDFParse;
  if (!PDFParse) {
    throw new Error('PDF extractor unavailable (pdf-parse did not expose PDFParse)');
  }
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text: string = result?.text || '';
    if (!text.trim()) {
      throw new Error('No extractable text found in PDF (scanned/image-only PDF?)');
    }
    return text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
