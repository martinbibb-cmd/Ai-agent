/**
 * Unified Document Parser
 * Routes files to appropriate parser and returns structured JSON
 */

import { PDFParser } from './pdf.js';
import { TextParser } from './text.js';
import {
  detectFileType,
  validateFileSignature,
  isSupportedFileType,
  getFileTypeName
} from '../fileSignature.js';

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
    console.log('[DocumentParser] Starting parse:', {
      filename: fileInfo.name,
      declaredMimeType: fileInfo.type,
      size: fileInfo.size
    });

    // Step 1: Validate file signature against declared MIME type
    const signatureValidation = validateFileSignature(buffer, fileInfo.type);
    console.log('[DocumentParser] Signature validation:', signatureValidation);

    if (!signatureValidation.isValid && signatureValidation.validatable) {
      const error = new Error(signatureValidation.message);
      error.code = 'SIGNATURE_MISMATCH';
      error.detectedType = signatureValidation.detectedType;
      error.declaredType = fileInfo.type;
      throw error;
    }

    // Step 2: Detect actual file type from content
    const detectedType = detectFileType(buffer);
    console.log('[DocumentParser] Detected file type from content:', detectedType || 'text/unknown');

    // Step 3: Check if file type is supported
    if (detectedType && !isSupportedFileType(detectedType)) {
      const error = new Error(
        `Unsupported file type: ${getFileTypeName(detectedType)}. ` +
        `Only PDF and text files are currently supported.`
      );
      error.code = 'UNSUPPORTED_FILE_TYPE';
      error.detectedType = detectedType;
      throw error;
    }

    // Step 4: Determine parser to use (prefer content-based detection over declared type)
    const parserType = this.detectParser(fileInfo, detectedType);
    console.log('[DocumentParser] Selected parser:', parserType);

    try {
      const parser = this.parsers[parserType];

      if (!parser) {
        throw new Error(`No parser available for type: ${parserType}`);
      }

      const result = await parser.parse(buffer, fileInfo);
      console.log('[DocumentParser] Parse completed successfully');
      return result;

    } catch (error) {
      console.error('[DocumentParser] Document parsing error:', error);

      // Re-throw validation errors without masking them
      if (error.code === 'SIGNATURE_MISMATCH' || error.code === 'UNSUPPORTED_FILE_TYPE') {
        throw error;
      }

      // For other parsing errors, add context but don't hide details
      const enhancedError = new Error(`Failed to parse ${parserType} file: ${error.message}`);
      enhancedError.code = 'PARSE_ERROR';
      enhancedError.parserType = parserType;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Detect which parser to use
   * @param {Object} fileInfo - File metadata
   * @param {string|null} detectedType - Content-based file type detection result
   * @returns {string} - Parser type (pdf, text, etc.)
   */
  detectParser(fileInfo, detectedType = null) {
    // Priority 1: Use content-based detection if available
    if (detectedType === 'pdf') {
      return 'pdf';
    }

    // Priority 2: Check declared MIME type with EXACT matching (not loose includes())
    const contentType = fileInfo.type || '';
    const filename = fileInfo.name || '';
    const ext = filename.split('.').pop()?.toLowerCase();

    // PDF files - exact MIME match
    if (contentType === 'application/pdf' || ext === 'pdf') {
      return 'pdf';
    }

    // Text-based files
    const textExtensions = [
      'txt', 'text', 'md', 'markdown', 'json', 'csv',
      'xml', 'html', 'htm', 'log', 'yaml', 'yml'
    ];

    // Use EXACT MIME type matching instead of loose .includes()
    const textMimeTypes = [
      'text/plain',
      'text/markdown',
      'application/json',
      'text/csv',
      'application/xml',
      'text/xml',
      'text/html',
      'application/yaml',
      'text/x-yaml'
    ];

    // Check for exact MIME match or if it starts with 'text/'
    const isTextMime = textMimeTypes.includes(contentType) || contentType.startsWith('text/');
    const isTextExt = textExtensions.includes(ext);

    if (isTextMime || isTextExt) {
      return 'text';
    }

    // If content detection says it's not a known binary format, assume text
    if (detectedType === null) {
      return 'text';
    }

    // If we get here, we have an unsupported file type
    // This should have been caught earlier by validation, but throw error as fallback
    throw new Error(
      `Unable to determine parser for file type. ` +
      `Detected: ${detectedType}, MIME: ${contentType}, Extension: ${ext}`
    );
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
