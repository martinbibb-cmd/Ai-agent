/**
 * Base Parser Interface
 * All file parsers implement this interface for consistent JSON output
 */

/**
 * Standard document structure returned by all parsers
 * @typedef {Object} ParsedDocument
 * @property {string} format - File format (pdf, txt, md, json, etc.)
 * @property {Object} metadata - Document metadata
 * @property {string} metadata.title - Document title
 * @property {string} metadata.author - Author if available
 * @property {Date} metadata.created - Creation date if available
 * @property {Date} metadata.modified - Modification date if available
 * @property {string} metadata.language - Language if detected
 * @property {number} metadata.size - File size in bytes
 * @property {Object} structure - Document structure information
 * @property {number} structure.pageCount - Number of pages/sections
 * @property {number} structure.wordCount - Approximate word count
 * @property {number} structure.characterCount - Character count
 * @property {Array<string>} structure.sections - Section titles/headers
 * @property {Array<Page>} pages - Array of pages/sections
 * @property {string} fullText - Complete text content
 * @property {Array<string>} chunks - Pre-chunked text for RAG/search
 */

/**
 * Page/Section structure
 * @typedef {Object} Page
 * @property {number} pageNumber - Page number (1-indexed)
 * @property {string} content - Page content
 * @property {Object} metadata - Page-specific metadata
 * @property {Array<string>} headers - Headers found on this page
 * @property {number} wordCount - Word count for this page
 */

export class BaseParser {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 1000;
    this.chunkOverlap = options.chunkOverlap || 200;
  }

  /**
   * Parse file buffer into structured document
   * @param {ArrayBuffer} buffer - File content
   * @param {Object} fileInfo - File metadata (name, type, size)
   * @returns {Promise<ParsedDocument>}
   */
  async parse(buffer, fileInfo = {}) {
    throw new Error('parse() must be implemented by subclass');
  }

  /**
   * Sanitize text for SQL storage
   * @param {string} text
   * @returns {string}
   */
  sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';

    return text
      // Remove all non-printable characters
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      // Remove null bytes
      .replace(/\0/g, '')
      // Normalize quotes and apostrophes
      .replace(/[''`]/g, "'")
      .replace(/[""]/g, '"')
      // Normalize dashes
      .replace(/[–—]/g, '-')
      // Remove zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Collapse multiple spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Chunk text into smaller pieces for better search
   * @param {string} text
   * @returns {Array<string>}
   */
  chunkText(text) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      let chunk = text.slice(start, end);

      // Try to break at sentence boundary
      if (end < text.length) {
        const lastPeriod = chunk.lastIndexOf('.');
        const lastNewline = chunk.lastIndexOf('\n');
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > this.chunkSize * 0.5) {
          chunk = chunk.slice(0, breakPoint + 1);
        }
      }

      const trimmed = chunk.trim();
      if (trimmed) {
        chunks.push(trimmed);
      }
      start = end - this.chunkOverlap;
    }

    return chunks;
  }

  /**
   * Count words in text
   * @param {string} text
   * @returns {number}
   */
  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Detect language (simple heuristic)
   * @param {string} text
   * @returns {string}
   */
  detectLanguage(text) {
    // Simple heuristic - can be enhanced
    const sample = text.slice(0, 1000).toLowerCase();

    // English indicators
    if (sample.match(/\b(the|and|or|is|are|was|were)\b/)) {
      return 'en';
    }

    return 'unknown';
  }

  /**
   * Extract headers from text (simple pattern matching)
   * @param {string} text
   * @returns {Array<string>}
   */
  extractHeaders(text) {
    const headers = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Headers are typically short, all caps, or followed by specific patterns
      if (trimmed.length > 0 && trimmed.length < 100) {
        // Check if line looks like a header
        if (
          /^[A-Z][A-Z\s]{3,50}$/.test(trimmed) || // ALL CAPS
          /^#+\s+.+/.test(trimmed) ||              // Markdown headers
          /^\d+\.\s+[A-Z].+/.test(trimmed)         // Numbered sections
        ) {
          headers.push(trimmed);
        }
      }
    }

    return headers;
  }

  /**
   * Create standard metadata object
   * @param {Object} fileInfo
   * @param {Object} extractedInfo
   * @returns {Object}
   */
  createMetadata(fileInfo = {}, extractedInfo = {}) {
    return {
      title: extractedInfo.title || fileInfo.name || 'Untitled',
      author: extractedInfo.author || null,
      created: extractedInfo.created || null,
      modified: extractedInfo.modified || null,
      language: extractedInfo.language || 'unknown',
      size: fileInfo.size || 0,
      contentType: fileInfo.type || 'application/octet-stream'
    };
  }

  /**
   * Create standard structure object
   * @param {Array<Page>} pages
   * @param {string} fullText
   * @returns {Object}
   */
  createStructure(pages, fullText) {
    const allHeaders = [];

    for (const page of pages) {
      if (page.metadata && page.metadata.headers) {
        allHeaders.push(...page.metadata.headers);
      }
    }

    return {
      pageCount: pages.length,
      wordCount: this.countWords(fullText),
      characterCount: fullText.length,
      sections: allHeaders
    };
  }
}
