/**
 * Enhanced PDF Parser with structured JSON output
 * Extracts text, metadata, and structure from PDF files
 */

import { BaseParser } from './base.js';

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
      const uint8Array = new Uint8Array(buffer);
      const pdfText = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array);

      // Extract metadata from PDF
      const metadata = this.extractPDFMetadata(pdfText, fileInfo);

      // Extract text content
      const rawText = this.extractTextFromPDF(buffer);
      const cleanText = this.sanitizeText(rawText);

      // Detect page breaks and split into pages
      const pages = this.splitIntoPages(pdfText, cleanText);

      // Create structure information
      const fullText = pages.map(p => p.content).join('\n\n');
      const structure = this.createStructure(pages, fullText);

      // Create chunks for RAG/search
      const chunks = this.chunkText(fullText);

      return {
        format: 'pdf',
        metadata,
        structure,
        pages,
        fullText,
        chunks,
        parseTimestamp: new Date().toISOString(),
        parser: {
          name: 'PDFParser',
          version: '2.0',
          method: 'regex-based-extraction'
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
          content: 'PDF uploaded but text extraction failed',
          metadata: {
            error: error.message,
            headers: [],
            wordCount: 0
          }
        }],
        fullText: 'PDF uploaded but text extraction failed',
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
   * Extract metadata from PDF structure
   * @param {string} pdfText - Decoded PDF content
   * @param {Object} fileInfo - File information
   * @returns {Object}
   */
  extractPDFMetadata(pdfText, fileInfo) {
    const metadata = {
      title: null,
      author: null,
      subject: null,
      creator: null,
      producer: null,
      created: null,
      modified: null,
      keywords: [],
      pdfVersion: null
    };

    try {
      // Extract PDF version
      const versionMatch = pdfText.match(/%PDF-(\d+\.\d+)/);
      if (versionMatch) {
        metadata.pdfVersion = versionMatch[1];
      }

      // Extract metadata from Info dictionary
      const titleMatch = pdfText.match(/\/Title\s*\(([^)]+)\)/);
      if (titleMatch) {
        metadata.title = this.decodePDFString(titleMatch[1]);
      }

      const authorMatch = pdfText.match(/\/Author\s*\(([^)]+)\)/);
      if (authorMatch) {
        metadata.author = this.decodePDFString(authorMatch[1]);
      }

      const subjectMatch = pdfText.match(/\/Subject\s*\(([^)]+)\)/);
      if (subjectMatch) {
        metadata.subject = this.decodePDFString(subjectMatch[1]);
      }

      const creatorMatch = pdfText.match(/\/Creator\s*\(([^)]+)\)/);
      if (creatorMatch) {
        metadata.creator = this.decodePDFString(creatorMatch[1]);
      }

      const producerMatch = pdfText.match(/\/Producer\s*\(([^)]+)\)/);
      if (producerMatch) {
        metadata.producer = this.decodePDFString(producerMatch[1]);
      }

      const keywordsMatch = pdfText.match(/\/Keywords\s*\(([^)]+)\)/);
      if (keywordsMatch) {
        const keywords = this.decodePDFString(keywordsMatch[1]);
        metadata.keywords = keywords.split(/[,;]/).map(k => k.trim()).filter(k => k);
      }

      // Extract creation date (format: D:YYYYMMDDHHmmSS)
      const creationDateMatch = pdfText.match(/\/CreationDate\s*\(D:(\d{14})/);
      if (creationDateMatch) {
        metadata.created = this.parsePDFDate(creationDateMatch[1]);
      }

      const modDateMatch = pdfText.match(/\/ModDate\s*\(D:(\d{14})/);
      if (modDateMatch) {
        metadata.modified = this.parsePDFDate(modDateMatch[1]);
      }

    } catch (error) {
      console.error('Metadata extraction error:', error);
    }

    // Merge with file info
    return this.createMetadata(fileInfo, metadata);
  }

  /**
   * Decode PDF string (handle escape sequences)
   * @param {string} str
   * @returns {string}
   */
  decodePDFString(str) {
    return str
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\(.)/g, '$1')
      .trim();
  }

  /**
   * Parse PDF date format (D:YYYYMMDDHHmmSS)
   * @param {string} dateStr
   * @returns {string} ISO date string
   */
  parsePDFDate(dateStr) {
    try {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const hour = dateStr.slice(8, 10);
      const minute = dateStr.slice(10, 12);
      const second = dateStr.slice(12, 14);

      return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract text from PDF buffer
   * @param {ArrayBuffer} buffer
   * @returns {string}
   */
  extractTextFromPDF(buffer) {
    try {
      const uint8Array = new Uint8Array(buffer);
      const text = new TextDecoder('latin1', { fatal: false }).decode(uint8Array);

      const textBlocks = [];

      // Extract text from PDF text objects (BT...ET blocks)
      const btPattern = /BT\s+([\s\S]*?)\s+ET/g;
      let match;
      let matchCount = 0;
      const maxMatches = 10000;

      while ((match = btPattern.exec(text)) !== null && matchCount < maxMatches) {
        matchCount++;
        const block = match[1];

        // Extract text from Tj operators
        this.extractTjOperators(block, textBlocks);

        // Extract text from TJ array operators
        this.extractTJArrayOperators(block, textBlocks);
      }

      return textBlocks.join(' ');
    } catch (error) {
      console.error('Text extraction error:', error);
      return '';
    }
  }

  /**
   * Extract text from Tj operators
   * @param {string} block
   * @param {Array<string>} textBlocks
   */
  extractTjOperators(block, textBlocks) {
    const tjPattern = /\(((?:[^()\\]|\\[()\\])*)\)\s*Tj/g;
    let match;
    let matchCount = 0;

    while ((match = tjPattern.exec(block)) !== null && matchCount < 1000) {
      matchCount++;
      try {
        const extractedText = this.decodePDFTextString(match[1]);
        if (extractedText && extractedText.trim()) {
          textBlocks.push(extractedText);
        }
      } catch (e) {
        continue;
      }
    }
  }

  /**
   * Extract text from TJ array operators
   * @param {string} block
   * @param {Array<string>} textBlocks
   */
  extractTJArrayOperators(block, textBlocks) {
    const tjArrayPattern = /\[((?:[^\]\\]|\\[\]\\])*)\]\s*TJ/g;
    let match;
    let matchCount = 0;

    while ((match = tjArrayPattern.exec(block)) !== null && matchCount < 1000) {
      matchCount++;
      try {
        const arrayContent = match[1];
        const stringPattern = /\(((?:[^()\\]|\\[()\\])*)\)/g;
        let stringMatch;
        let stringMatchCount = 0;

        while ((stringMatch = stringPattern.exec(arrayContent)) !== null && stringMatchCount < 100) {
          stringMatchCount++;
          const extractedText = this.decodePDFTextString(stringMatch[1]);
          if (extractedText && extractedText.trim()) {
            textBlocks.push(extractedText);
          }
        }
      } catch (e) {
        continue;
      }
    }
  }

  /**
   * Decode PDF text string (octal escape sequences)
   * @param {string} str
   * @returns {string}
   */
  decodePDFTextString(str) {
    return str
      .replace(/\\(\d{3})/g, (_, oct) => {
        const code = parseInt(oct, 8);
        return (code >= 32 && code <= 126) ? String.fromCharCode(code) : ' ';
      })
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\(.)/g, '$1');
  }

  /**
   * Split text into pages based on PDF structure
   * @param {string} pdfText - Raw PDF text
   * @param {string} cleanText - Extracted clean text
   * @returns {Array<Page>}
   */
  splitIntoPages(pdfText, cleanText) {
    const pages = [];

    try {
      // Count actual page objects in PDF
      const pageMatches = pdfText.match(/\/Type\s*\/Page[^s]/g) || [];
      const pageCount = Math.max(pageMatches.length, 1);

      // Look for page break markers
      const pageBreaks = this.findPageBreaks(cleanText);

      if (pageBreaks.length > 0 && pageBreaks.length < pageCount * 2) {
        // Use detected page breaks
        for (let i = 0; i < pageBreaks.length; i++) {
          const start = i === 0 ? 0 : pageBreaks[i - 1];
          const end = pageBreaks[i];
          const pageText = cleanText.slice(start, end).trim();

          if (pageText.length > 0) {
            pages.push(this.createPage(i + 1, pageText));
          }
        }

        // Add final page
        const lastBreak = pageBreaks[pageBreaks.length - 1];
        const lastPageText = cleanText.slice(lastBreak).trim();
        if (lastPageText.length > 0) {
          pages.push(this.createPage(pageBreaks.length + 1, lastPageText));
        }
      } else {
        // Fall back to character-based splitting
        const charsPerPage = Math.ceil(cleanText.length / pageCount);

        for (let i = 0; i < pageCount; i++) {
          const start = i * charsPerPage;
          const end = Math.min(start + charsPerPage, cleanText.length);
          const pageText = cleanText.slice(start, end).trim();

          if (pageText.length > 0) {
            pages.push(this.createPage(i + 1, pageText));
          }
        }
      }

      // If no pages, create one
      if (pages.length === 0 && cleanText.length > 0) {
        pages.push(this.createPage(1, cleanText));
      }

    } catch (error) {
      console.error('Page splitting error:', error);
      // Fallback: single page
      if (cleanText.length > 0) {
        pages.push(this.createPage(1, cleanText));
      }
    }

    return pages.length > 0 ? pages : [this.createPage(1, 'No extractable text found')];
  }

  /**
   * Find potential page breaks in text
   * @param {string} text
   * @returns {Array<number>} - Character positions of page breaks
   */
  findPageBreaks(text) {
    const breaks = [];
    const lines = text.split('\n');
    let currentPos = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentPos += line.length + 1; // +1 for newline

      // Look for page break indicators
      if (
        /^\s*Page\s+\d+\s*$/i.test(line) ||
        /^\s*-\s*\d+\s*-\s*$/.test(line) ||
        /^\f/.test(line) // Form feed character
      ) {
        breaks.push(currentPos);
      }
    }

    return breaks;
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
