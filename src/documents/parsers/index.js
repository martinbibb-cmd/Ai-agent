/**
 * Unified Document Parser
 * Routes files to appropriate parser and returns structured JSON
 */

import { PDFParser } from './pdf.js';
import { TextParser } from './text.js';

/**
 * Parser factory - creates appropriate parser for file type
 */
export class DocumentParser {
  constructor(options = {}) {
    this.options = options;
    this.parsers = {
      pdf: new PDFParser(options),
      text: new TextParser(options)
    };
  }

  /**
   * Parse any supported file type
   * @param {ArrayBuffer} buffer - File content
   * @param {Object} fileInfo - File metadata
   * @param {string} fileInfo.name - Filename
   * @param {string} fileInfo.type - MIME type
   * @param {number} fileInfo.size - File size in bytes
   * @returns {Promise<ParsedDocument>}
   */
  async parse(buffer, fileInfo = {}) {
    const parserType = this.detectParser(fileInfo);

    try {
      const parser = this.parsers[parserType];

      if (!parser) {
        throw new Error(`No parser available for type: ${parserType}`);
      }

      return await parser.parse(buffer, fileInfo);

    } catch (error) {
      console.error('Document parsing error:', error);

      // Return error document
      return {
        format: 'unknown',
        metadata: {
          title: fileInfo.name || 'Unknown',
          author: null,
          created: null,
          modified: null,
          language: 'unknown',
          size: fileInfo.size || 0,
          contentType: fileInfo.type || 'application/octet-stream'
        },
        structure: {
          pageCount: 0,
          wordCount: 0,
          characterCount: 0,
          sections: []
        },
        pages: [],
        fullText: '',
        chunks: [],
        parseTimestamp: new Date().toISOString(),
        error: {
          message: error.message,
          type: 'unsupported_format'
        }
      };
    }
  }

  /**
   * Detect which parser to use
   * @param {Object} fileInfo
   * @returns {string} - Parser type (pdf, text, etc.)
   */
  detectParser(fileInfo) {
    const contentType = fileInfo.type || '';
    const filename = fileInfo.name || '';
    const ext = filename.split('.').pop()?.toLowerCase();

    // PDF files
    if (contentType === 'application/pdf' || ext === 'pdf') {
      return 'pdf';
    }

    // Text-based files
    const textExtensions = [
      'txt', 'text', 'md', 'markdown', 'json', 'csv',
      'xml', 'html', 'htm', 'log', 'yaml', 'yml'
    ];

    const textMimeTypes = [
      'text/plain',
      'text/markdown',
      'application/json',
      'text/csv',
      'application/xml',
      'text/xml',
      'text/html',
      'application/yaml'
    ];

    if (
      textMimeTypes.some(type => contentType.includes(type)) ||
      textExtensions.includes(ext)
    ) {
      return 'text';
    }

    // Default to text parser for unknown types
    return 'text';
  }

  /**
   * Get list of supported file types
   * @returns {Object}
   */
  getSupportedTypes() {
    return {
      pdf: {
        extensions: ['pdf'],
        mimeTypes: ['application/pdf'],
        description: 'PDF documents with text extraction'
      },
      text: {
        extensions: ['txt', 'text', 'md', 'markdown', 'json', 'csv', 'xml', 'html', 'log', 'yaml', 'yml'],
        mimeTypes: ['text/plain', 'text/markdown', 'application/json', 'text/csv', 'application/xml', 'text/html'],
        description: 'Text-based files with format detection'
      }
    };
  }

  /**
   * Check if file type is supported
   * @param {string} filename
   * @param {string} mimeType
   * @returns {boolean}
   */
  isSupported(filename, mimeType) {
    const parserType = this.detectParser({ name: filename, type: mimeType });
    return parserType !== 'unknown';
  }
}

// Export individual parsers for direct use
export { PDFParser } from './pdf.js';
export { TextParser } from './text.js';
export { BaseParser } from './base.js';

// Export for backward compatibility with old parser.js
export { sanitizeTextForSQL, chunkText } from './legacy.js';
