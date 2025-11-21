/**
 * Legacy compatibility layer
 * Maintains backward compatibility with old parser.js exports
 */

import { PDFParser } from './pdf.js';
import { BaseParser } from './base.js';

/**
 * Legacy sanitize function (backward compatible)
 * @param {string} text
 * @returns {string}
 */
export function sanitizeTextForSQL(text) {
  const parser = new BaseParser();
  return parser.sanitizeText(text);
}

/**
 * Legacy chunk function (backward compatible)
 * @param {string} text
 * @param {number} chunkSize
 * @param {number} overlap
 * @returns {Array<string>}
 */
export function chunkText(text, chunkSize = 1000, overlap = 200) {
  const parser = new BaseParser({ chunkSize, chunkOverlap: overlap });
  return parser.chunkText(text);
}

/**
 * Legacy parsePDF function (backward compatible)
 * Returns old format for compatibility
 * @param {ArrayBuffer} pdfBuffer
 * @returns {Promise<Object>}
 */
export async function parsePDF(pdfBuffer) {
  const parser = new PDFParser();
  const result = await parser.parse(pdfBuffer, {});

  // Convert to old format
  return {
    pages: result.pages.map(page => ({
      pageNumber: page.pageNumber,
      text: page.content
    })),
    pageCount: result.structure.pageCount,
    metadata: result.metadata
  };
}

/**
 * Legacy extractTextFallback function (backward compatible)
 * @param {ArrayBuffer} pdfBuffer
 * @returns {string}
 */
export function extractTextFallback(pdfBuffer) {
  const parser = new PDFParser();
  return parser.extractTextFromPDF(pdfBuffer);
}
