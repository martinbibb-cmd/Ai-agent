// PDF Parser using pdfjs-dist (works in Cloudflare Workers)
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

/**
 * Extract text from PDF buffer
 * @param {ArrayBuffer} pdfBuffer - PDF file as ArrayBuffer
 * @returns {Promise<Array<{pageNumber: number, text: string}>>}
 */
export async function parsePDF(pdfBuffer) {
  try {
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const pages = [];

    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Combine text items into a single string
      const text = textContent.items
        .map(item => item.str)
        .join(' ')
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      pages.push({
        pageNumber: pageNum,
        text: text
      });
    }

    return {
      pages,
      pageCount: pdf.numPages,
      metadata: await pdf.getMetadata()
    };

  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}

/**
 * Simple fallback text extraction if pdfjs-dist fails
 * Extracts text between stream objects
 * @param {ArrayBuffer} pdfBuffer
 * @returns {string}
 */
export function extractTextFallback(pdfBuffer) {
  try {
    const uint8Array = new Uint8Array(pdfBuffer);
    const text = new TextDecoder('utf-8').decode(uint8Array);

    // Very basic extraction - looks for text between BT and ET markers
    const textBlocks = [];
    const btPattern = /BT\s+(.*?)\s+ET/gs;
    let match;

    while ((match = btPattern.exec(text)) !== null) {
      const block = match[1]
        .replace(/\/\w+\s+[\d.]+\s+Tf/g, '') // Remove font definitions
        .replace(/[\d.]+\s+[\d.]+\s+Td/g, ' ') // Remove positioning
        .replace(/\((.*?)\)\s*Tj/g, '$1 ') // Extract text in parentheses
        .replace(/\[(.*?)\]\s*TJ/g, '$1 ') // Extract text in brackets
        .trim();

      if (block) {
        textBlocks.push(block);
      }
    }

    return textBlocks.join(' ').replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.error('Fallback extraction error:', error);
    return '';
  }
}

/**
 * Chunk text into smaller pieces for better search
 * @param {string} text
 * @param {number} chunkSize - Target size in characters
 * @param {number} overlap - Overlap between chunks
 * @returns {Array<string>}
 */
export function chunkText(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf('.');
      const lastNewline = chunk.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > chunkSize * 0.5) {
        chunk = chunk.slice(0, breakPoint + 1);
      }
    }

    chunks.push(chunk.trim());
    start = end - overlap;
  }

  return chunks;
}
