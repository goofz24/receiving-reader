// Rough cost estimate BEFORE calling the API, so nothing is spent by surprise.
//
// How Claude counts document tokens (approximate):
//   - An image costs about (width x height) / 750 tokens, after it is shrunk
//     to fit 1568 px on the long side.
//   - A PDF page is sent as an image of the page plus its text: we budget
//     about 2,300 tokens per page.
// Output is the JSON answer plus the model's thinking; we budget generously.
// The real numbers come back from the API in `usage` and go into the spend log.

import { PRICES, estimateCost } from "./extract";

const SYSTEM_PROMPT_TOKENS = 700;
const PDF_PAGE_TOKENS = 2300;

export function imageTokens(width: number, height: number): number {
  const scale = Math.min(1, 1568 / Math.max(width, height));
  return Math.ceil((width * scale * height * scale) / 750);
}

/** Read width and height from a PNG or JPEG header without any library. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const b = Buffer.from(bytes);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC) carry the size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** Count pages in a PDF by looking for page objects. Good enough for an estimate. */
export function pdfPageCount(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString("latin1");
  return Math.max(1, (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length);
}

export function estimateInputTokens(bytes: Uint8Array, mediaType: string): number {
  if (mediaType === "application/pdf") return SYSTEM_PROMPT_TOKENS + pdfPageCount(bytes) * PDF_PAGE_TOKENS;
  const size = imageSize(bytes);
  return SYSTEM_PROMPT_TOKENS + (size ? imageTokens(size.width, size.height) : 1600);
}

/** Budget for the answer + thinking. Pages with more lines produce more output. */
export function estimateOutputTokens(bytes: Uint8Array, mediaType: string): number {
  const pages = mediaType === "application/pdf" ? pdfPageCount(bytes) : 1;
  return 2500 * pages;
}

export function estimateDocumentCost(bytes: Uint8Array, mediaType: string, model: string): number {
  if (!PRICES[model]) throw new Error(`No price on file for ${model}. Add it to PRICES in server/extract.ts.`);
  return estimateCost(model, estimateInputTokens(bytes, mediaType), estimateOutputTokens(bytes, mediaType))!;
}
