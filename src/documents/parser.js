/**
 * Ultra-aggressive text sanitization for D1 compatibility
 * Only allows safe ASCII characters
 * @param {string} text
 * @returns {string}
 */
export function sanitizeTextForSQL(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    // Remove all non-printable characters
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    // Remove any remaining problematic characters
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
 * Extract text from PDF buffer
 * Uses a simple text extraction method that works reliably in Cloudflare Workers
 * @param {ArrayBuffer} pdfBuffer - PDF file as ArrayBuffer
 * @returns {Promise<{pages: Array, pageCount: number, metadata: Object}>}
 */
export async function parsePDF(pdfBuffer) {
  try {
    // Use the improved fallback method which is more reliable in Workers
    const text = extractTextFallback(pdfBuffer);

    // Sanitize immediately after extraction
    const cleanText = sanitizeTextForSQL(text);

    // Estimate page count from PDF structure
    const uint8Array = new Uint8Array(pdfBuffer);
    const pdfText = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array);
    const pageMatches = pdfText.match(/\/Type\s*\/Page[^s]/g) || [];
    const pageCount = Math.max(pageMatches.length, 1);

    // Split text into approximate pages if we found page markers
    const pages = [];
    if (pageCount > 1 && cleanText.length > 0) {
      const charsPerPage = Math.ceil(cleanText.length / pageCount);
      for (let i = 0; i < pageCount; i++) {
        const start = i * charsPerPage;
        const end = Math.min(start + charsPerPage, cleanText.length);
        const pageText = cleanText.slice(start, end).trim();

        if (pageText.length > 0) {
          pages.push({
            pageNumber: i + 1,
            text: pageText
          });
        }
      }
    } else if (cleanText.length > 0) {
      // Single page
      pages.push({
        pageNumber: 1,
        text: cleanText
      });
    }

    // If we got no pages, create one with a placeholder
    if (pages.length === 0) {
      pages.push({
        pageNumber: 1,
        text: 'No extractable text found in PDF'
      });
    }

    return {
      pages: pages,
      pageCount: pages.length,
      metadata: {}
    };

  } catch (error) {
    console.error('PDF parsing error:', error);
    // Return a safe fallback
    return {
      pages: [{
        pageNumber: 1,
        text: 'PDF uploaded but text extraction failed'
      }],
      pageCount: 1,
      metadata: {}
    };
  }
}

/**
 * Improved text extraction from PDF
 * Extracts text from PDF stream objects
 * @param {ArrayBuffer} pdfBuffer
 * @returns {string}
 */
export function extractTextFallback(pdfBuffer) {
  try {
    const uint8Array = new Uint8Array(pdfBuffer);
    const text = new TextDecoder('latin1', { fatal: false }).decode(uint8Array);

    const textBlocks = [];

    // Extract text from PDF text objects (BT...ET blocks)
    const btPattern = /BT\s+([\s\S]*?)\s+ET/g;
    let match;
    let matchCount = 0;
    const maxMatches = 10000; // Prevent infinite loops

    while ((match = btPattern.exec(text)) !== null && matchCount < maxMatches) {
      matchCount++;
      const block = match[1];

      // Extract text from Tj and TJ operators
      const tjPattern = /\(((?:[^()\\]|\\[()\\])*)\)\s*Tj/g;
      const tjArrayPattern = /\[((?:[^\]\\]|\\[\]\\])*)\]\s*TJ/g;

      let tjMatch;
      let tjMatchCount = 0;
      while ((tjMatch = tjPattern.exec(block)) !== null && tjMatchCount < 1000) {
        tjMatchCount++;
        try {
          const extractedText = tjMatch[1]
            .replace(/\\(\d{3})/g, (_, oct) => {
              const code = parseInt(oct, 8);
              return (code >= 32 && code <= 126) ? String.fromCharCode(code) : ' ';
            })
            .replace(/\\n/g, ' ')
            .replace(/\\r/g, ' ')
            .replace(/\\t/g, ' ')
            .replace(/\\(.)/g, '$1');

          if (extractedText && extractedText.trim()) {
            textBlocks.push(extractedText);
          }
        } catch (e) {
          // Skip problematic text blocks
          continue;
        }
      }

      // Also extract from TJ arrays
      let tjArrayMatch;
      let tjArrayMatchCount = 0;
      while ((tjArrayMatch = tjArrayPattern.exec(block)) !== null && tjArrayMatchCount < 1000) {
        tjArrayMatchCount++;
        try {
          const arrayContent = tjArrayMatch[1];
          const stringPattern = /\(((?:[^()\\]|\\[()\\])*)\)/g;
          let stringMatch;
          let stringMatchCount = 0;

          while ((stringMatch = stringPattern.exec(arrayContent)) !== null && stringMatchCount < 100) {
            stringMatchCount++;
            const extractedText = stringMatch[1]
              .replace(/\\(\d{3})/g, (_, oct) => {
                const code = parseInt(oct, 8);
                return (code >= 32 && code <= 126) ? String.fromCharCode(code) : ' ';
              })
              .replace(/\\n/g, ' ')
              .replace(/\\r/g, ' ')
              .replace(/\\t/g, ' ')
              .replace(/\\(.)/g, '$1');

            if (extractedText && extractedText.trim()) {
              textBlocks.push(extractedText);
            }
          }
        } catch (e) {
          // Skip problematic arrays
          continue;
        }
      }
    }

    // Join all text blocks
    const fullText = textBlocks.join(' ');

    return fullText || '';
  } catch (error) {
    console.error('Text extraction error:', error);
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
