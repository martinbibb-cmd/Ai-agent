/**
 * Text File Parser (TXT, MD, and other text formats)
 * Handles plain text, markdown, and structured text files
 */

import { BaseParser } from './base.js';

export class TextParser extends BaseParser {
  constructor(options = {}) {
    super(options);
    this.pageSize = options.pageSize || 2000; // Characters per "page"
  }

  /**
   * Parse text buffer into structured document
   * @param {ArrayBuffer} buffer - Text file as ArrayBuffer
   * @param {Object} fileInfo - File metadata
   * @returns {Promise<ParsedDocument>}
   */
  async parse(buffer, fileInfo = {}) {
    try {
      // Decode text with multiple encoding attempts
      const text = this.decodeText(buffer);
      const cleanText = this.sanitizeText(text);

      // Detect format
      const format = this.detectTextFormat(cleanText, fileInfo);

      // Extract structure based on format
      const pages = this.splitIntoPages(cleanText, format);

      // Create metadata
      const language = this.detectLanguage(cleanText);
      const metadata = this.createMetadata(fileInfo, { language });

      // Create structure
      const fullText = pages.map(p => p.content).join('\n\n');
      const structure = this.createStructure(pages, fullText);

      // Create chunks
      const chunks = this.chunkText(fullText);

      return {
        format,
        metadata,
        structure,
        pages,
        fullText,
        chunks,
        parseTimestamp: new Date().toISOString(),
        parser: {
          name: 'TextParser',
          version: '2.0',
          encoding: 'utf-8'
        }
      };

    } catch (error) {
      console.error('Text parsing error:', error);

      return {
        format: 'txt',
        metadata: this.createMetadata(fileInfo, {}),
        structure: {
          pageCount: 1,
          wordCount: 0,
          characterCount: 0,
          sections: []
        },
        pages: [{
          pageNumber: 1,
          content: 'Text file uploaded but parsing failed',
          metadata: {
            error: error.message,
            headers: [],
            wordCount: 0
          }
        }],
        fullText: 'Text file uploaded but parsing failed',
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
   * Decode text with fallback encodings
   * @param {ArrayBuffer} buffer
   * @returns {string}
   */
  decodeText(buffer) {
    const encodings = ['utf-8', 'latin1', 'windows-1252'];

    for (const encoding of encodings) {
      try {
        const decoder = new TextDecoder(encoding, { fatal: true });
        return decoder.decode(buffer);
      } catch (e) {
        continue;
      }
    }

    // Final fallback
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }

  /**
   * Detect specific text format
   * @param {string} text
   * @param {Object} fileInfo
   * @returns {string}
   */
  detectTextFormat(text, fileInfo) {
    const filename = fileInfo.name || '';
    const ext = filename.split('.').pop()?.toLowerCase();

    // Check file extension first
    if (ext === 'md' || ext === 'markdown') {
      return 'markdown';
    }

    if (ext === 'json') {
      return 'json';
    }

    if (ext === 'csv') {
      return 'csv';
    }

    if (ext === 'xml' || ext === 'html') {
      return ext;
    }

    // Detect by content
    const sample = text.slice(0, 1000);

    // Markdown detection
    if (
      sample.match(/^#{1,6}\s+/m) ||           // Headers
      sample.match(/\*\*.*?\*\*/g) ||          // Bold
      sample.match(/\[.*?\]\(.*?\)/g) ||       // Links
      sample.match(/^[-*+]\s+/m)               // Lists
    ) {
      return 'markdown';
    }

    // JSON detection
    if (sample.trim().startsWith('{') || sample.trim().startsWith('[')) {
      try {
        JSON.parse(text);
        return 'json';
      } catch (e) {
        // Not valid JSON
      }
    }

    // CSV detection
    if (sample.split('\n')[0]?.includes(',') && sample.split('\n').length > 1) {
      const lines = sample.split('\n').slice(0, 5);
      const commaCount = lines.map(l => (l.match(/,/g) || []).length);
      if (commaCount.every(c => c === commaCount[0] && c > 0)) {
        return 'csv';
      }
    }

    // XML/HTML detection
    if (sample.includes('<?xml') || sample.match(/<[a-zA-Z][^>]*>/)) {
      return sample.includes('<?xml') ? 'xml' : 'html';
    }

    // Default to plain text
    return 'txt';
  }

  /**
   * Split text into pages based on format
   * @param {string} text
   * @param {string} format
   * @returns {Array<Page>}
   */
  splitIntoPages(text, format) {
    switch (format) {
      case 'markdown':
        return this.splitMarkdown(text);
      case 'json':
        return this.splitJSON(text);
      case 'csv':
        return this.splitCSV(text);
      default:
        return this.splitPlainText(text);
    }
  }

  /**
   * Split markdown by headers
   * @param {string} text
   * @returns {Array<Page>}
   */
  splitMarkdown(text) {
    const pages = [];
    const sections = [];

    // Split by top-level headers (# or ##)
    const headerPattern = /^(#{1,2})\s+(.+)$/gm;
    let lastIndex = 0;
    let match;
    let pageNumber = 1;

    while ((match = headerPattern.exec(text)) !== null) {
      if (lastIndex > 0) {
        const content = text.slice(lastIndex, match.index).trim();
        if (content.length > 0) {
          sections.push({ content, header: sections[sections.length - 1]?.header });
        }
      }

      lastIndex = match.index;
      sections.push({ header: match[2], startIndex: match.index });
    }

    // Add final section
    if (lastIndex < text.length) {
      const content = text.slice(lastIndex).trim();
      if (content.length > 0) {
        sections.push({ content, header: sections[sections.length - 1]?.header });
      }
    }

    // Convert sections to pages
    for (const section of sections) {
      if (section.content) {
        pages.push({
          pageNumber: pageNumber++,
          content: section.content,
          metadata: {
            headers: section.header ? [section.header] : [],
            wordCount: this.countWords(section.content),
            characterCount: section.content.length,
            format: 'markdown'
          }
        });
      }
    }

    // If no sections found, use character-based splitting
    if (pages.length === 0) {
      return this.splitPlainText(text);
    }

    return pages;
  }

  /**
   * Split JSON into logical pages
   * @param {string} text
   * @returns {Array<Page>}
   */
  splitJSON(text) {
    try {
      const data = JSON.parse(text);
      const formatted = JSON.stringify(data, null, 2);

      // If it's an array, each item is a "page"
      if (Array.isArray(data)) {
        return data.map((item, index) => ({
          pageNumber: index + 1,
          content: JSON.stringify(item, null, 2),
          metadata: {
            headers: [`Item ${index + 1}`],
            wordCount: this.countWords(JSON.stringify(item)),
            characterCount: JSON.stringify(item).length,
            format: 'json',
            itemType: typeof item
          }
        }));
      }

      // If it's an object, each top-level key is a "page"
      if (typeof data === 'object' && data !== null) {
        const pages = [];
        let pageNumber = 1;

        for (const [key, value] of Object.entries(data)) {
          const content = JSON.stringify({ [key]: value }, null, 2);
          pages.push({
            pageNumber: pageNumber++,
            content,
            metadata: {
              headers: [key],
              wordCount: this.countWords(content),
              characterCount: content.length,
              format: 'json',
              key
            }
          });
        }

        return pages.length > 0 ? pages : [this.createTextPage(1, formatted)];
      }

      // Single value
      return [this.createTextPage(1, formatted)];

    } catch (error) {
      // Invalid JSON, treat as plain text
      return this.splitPlainText(text);
    }
  }

  /**
   * Split CSV into pages (header + row groups)
   * @param {string} text
   * @returns {Array<Page>}
   */
  splitCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return [this.createTextPage(1, text)];
    }

    const header = lines[0];
    const rowsPerPage = 100;
    const pages = [];

    for (let i = 1; i < lines.length; i += rowsPerPage) {
      const pageRows = lines.slice(i, i + rowsPerPage);
      const content = [header, ...pageRows].join('\n');

      pages.push({
        pageNumber: pages.length + 1,
        content,
        metadata: {
          headers: [header],
          wordCount: this.countWords(content),
          characterCount: content.length,
          format: 'csv',
          rowRange: `${i}-${Math.min(i + rowsPerPage - 1, lines.length - 1)}`
        }
      });
    }

    return pages.length > 0 ? pages : [this.createTextPage(1, text)];
  }

  /**
   * Split plain text into pages by size
   * @param {string} text
   * @returns {Array<Page>}
   */
  splitPlainText(text) {
    const pages = [];
    let pageNumber = 1;
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.pageSize, text.length);
      let content = text.slice(start, end);

      // Try to break at paragraph boundary
      if (end < text.length) {
        const lastDoubleNewline = content.lastIndexOf('\n\n');
        const lastNewline = content.lastIndexOf('\n');

        if (lastDoubleNewline > this.pageSize * 0.5) {
          content = content.slice(0, lastDoubleNewline);
        } else if (lastNewline > this.pageSize * 0.5) {
          content = content.slice(0, lastNewline);
        }
      }

      const trimmed = content.trim();
      if (trimmed.length > 0) {
        pages.push(this.createTextPage(pageNumber++, trimmed));
      }

      start += content.length;
    }

    return pages.length > 0 ? pages : [this.createTextPage(1, text)];
  }

  /**
   * Create a text page object
   * @param {number} pageNumber
   * @param {string} content
   * @returns {Page}
   */
  createTextPage(pageNumber, content) {
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
