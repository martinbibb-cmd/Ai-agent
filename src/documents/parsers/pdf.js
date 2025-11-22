/**
 * Enhanced PDF Parser with structured JSON output
 * Extracts text, metadata, and structure from PDF files using unpdf
 * Optimized for Cloudflare Workers and edge runtimes
 */

import { BaseParser } from './base.js';
import { getDocumentProxy } from 'unpdf';

export class PDFParser extends BaseParser {
  constructor(options = {}) {
    super(options);
  }

  /**
   * Parse PDF buffer into structured document
   * @param {ArrayBuffer} buffer - PDF file as ArrayBuffer
   * @param {Object} fileInfo - File metadata
   * @returns {Promise<ParsedDocument>}
   */
  async parse(buffer, fileInfo = {}) {
    try {
      // Get PDF document proxy using unpdf
      const pdf = await getDocumentProxy(new Uint8Array(buffer));

      // Extract metadata
      const pdfMetadata = await pdf.getMetadata().catch(() => ({ info: {} }));
      const metadata = this.extractPDFMetadata(pdfMetadata.info, fileInfo);

      // Extract text from all pages
      const pages = [];
      const numPages = pdf.numPages;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Combine text items into readable text
        const pageText = textContent.items
          .map(item => item.str || '')
          .join(' ');

        const cleanText = this.sanitizeText(pageText);

        if (cleanText && cleanText.trim().length > 0) {
          pages.push(this.createPage(pageNum, cleanText));
        }
      }

      // Create full text and structure
      const fullText = pages.map(p => p.content).join('\n\n');
      const structure = this.createStructure(pages, fullText);

      // Create chunks for RAG/search
      const chunks = this.chunkText(fullText);

      // Cleanup
      await pdf.destroy();

      return {
        format: 'pdf',
        metadata,
        structure,
        pages: pages.length > 0 ? pages : [{
          pageNumber: 1,
          content: 'PDF processed but no text found (might be image-based)',
          metadata: { headers: [], wordCount: 0 }
        }],
        fullText: fullText || 'PDF processed but no text found (might be image-based)',
        chunks,
        parseTimestamp: new Date().toISOString(),
        parser: {
          name: 'PDFParser',
          version: '3.0',
          method: 'unpdf-extraction'
        }
      };

    } catch (error) {
      console.error('PDF parsing error:', error);

      // Return safe fallback with error information
      return {
        format: 'pdf',
        metadata: this.createMetadata(fileInfo, {}),
        structure: {
          pageCount: 1,
          wordCount: 0,
          characterCount: 0,
          sections: []
        },
        pages: [{
          pageNumber: 1,
          content: 'PDF uploaded but text extraction failed: ' + error.message,
          metadata: {
            error: error.message,
            headers: [],
            wordCount: 0
          }
        }],
        fullText: 'PDF uploaded but text extraction failed: ' + error.message,
        chunks: [],
        parseTimestamp: new Date().toISOString(),
        error: {
          message: error.message,
          type: 'parsing_error'
        }
      };
    }
  }

  /**
   * Extract metadata from unpdf info object
   * @param {Object} info - unpdf info object
   * @param {Object} fileInfo - File information
   * @returns {Object}
   */
  extractPDFMetadata(info = {}, fileInfo) {
    const metadata = {
      title: info.Title || null,
      author: info.Author || null,
      subject: info.Subject || null,
      creator: info.Creator || null,
      producer: info.Producer || null,
      created: null,
      modified: null,
      keywords: [],
      pdfVersion: info.PDFFormatVersion || null
    };

    try {
      // Parse keywords if available
      if (info.Keywords) {
        metadata.keywords = info.Keywords.split(/[,;]/).map(k => k.trim()).filter(k => k);
      }

      // Parse creation date
      if (info.CreationDate) {
        metadata.created = this.parsePDFDateString(info.CreationDate);
      }

      // Parse modification date
      if (info.ModDate) {
        metadata.modified = this.parsePDFDateString(info.ModDate);
      }

    } catch (error) {
      console.error('Metadata extraction error:', error);
    }

    // Merge with file info
    return this.createMetadata(fileInfo, metadata);
  }

  /**
   * Parse PDF date string (D:YYYYMMDDHHmmSS format or ISO format)
   * @param {string} dateStr
   * @returns {string} ISO date string
   */
  parsePDFDateString(dateStr) {
    try {
      if (!dateStr) return null;

      // Remove D: prefix if present
      let cleaned = dateStr.replace(/^D:/, '');

      // Try to parse as PDF date format (YYYYMMDDHHmmSS)
      if (/^\d{14}/.test(cleaned)) {
        const year = cleaned.slice(0, 4);
        const month = cleaned.slice(4, 6);
        const day = cleaned.slice(6, 8);
        const hour = cleaned.slice(8, 10);
        const minute = cleaned.slice(10, 12);
        const second = cleaned.slice(12, 14);

        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
      }

      // Try to parse as ISO date
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create a page object
   * @param {number} pageNumber
   * @param {string} content
   * @returns {Page}
   */
  createPage(pageNumber, content) {
    const headers = this.extractHeaders(content);

    return {
      pageNumber,
      content,
      metadata: {
        headers,
        wordCount: this.countWords(content),
        characterCount: content.length
      }
    };
  }
}
