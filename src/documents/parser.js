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

    // Estimate page count from PDF structure
    const uint8Array = new Uint8Array(pdfBuffer);
    const pdfText = new TextDecoder('utf-8').decode(uint8Array);
    const pageMatches = pdfText.match(/\/Type\s*\/Page[^s]/g) || [];
    const pageCount = Math.max(pageMatches.length, 1);

    // Split text into approximate pages if we found page markers
    const pages = [];
    if (pageCount > 1 && text.length > 0) {
      const charsPerPage = Math.ceil(text.length / pageCount);
      for (let i = 0; i < pageCount; i++) {
        const start = i * charsPerPage;
        const end = Math.min(start + charsPerPage, text.length);
        pages.push({
          pageNumber: i + 1,
          text: text.slice(start, end).trim()
        });
      }
    } else {
      // Single page or couldn't split
      pages.push({
        pageNumber: 1,
        text: text
      });
    }

    return {
      pages: pages.filter(p => p.text.length > 0), // Only include pages with text
      pageCount: pages.length,
      metadata: {}
    };

  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error(`Failed to parse PDF: ${error.message}`);
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
    const text = new TextDecoder('latin1').decode(uint8Array); // Use latin1 for better PDF compatibility

    const textBlocks = [];

    // Extract text from PDF text objects (BT...ET blocks)
    const btPattern = /BT\s+([\s\S]*?)\s+ET/g;
    let match;

    while ((match = btPattern.exec(text)) !== null) {
      const block = match[1];

      // Extract text from Tj and TJ operators
      const tjPattern = /\(((?:[^()\\]|\\[()\\])*)\)\s*Tj/g;
      const tjArrayPattern = /\[((?:[^\]\\]|\\[\]\\])*)\]\s*TJ/g;

      let tjMatch;
      while ((tjMatch = tjPattern.exec(block)) !== null) {
        const extractedText = tjMatch[1]
          .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))) // Octal escapes
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\(.)/g, '$1'); // Other escapes

        if (extractedText.trim()) {
          textBlocks.push(extractedText);
        }
      }

      // Also extract from TJ arrays
      let tjArrayMatch;
      while ((tjArrayMatch = tjArrayPattern.exec(block)) !== null) {
        const arrayContent = tjArrayMatch[1];
        const stringPattern = /\(((?:[^()\\]|\\[()\\])*)\)/g;
        let stringMatch;

        while ((stringMatch = stringPattern.exec(arrayContent)) !== null) {
          const extractedText = stringMatch[1]
            .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\(.)/g, '$1');

          if (extractedText.trim()) {
            textBlocks.push(extractedText);
          }
        }
      }
    }

    // Join all text blocks and normalize whitespace
    const fullText = textBlocks
      .join(' ')
      .replace(/\0/g, '') // Remove null bytes
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, ' ') // Remove control characters except \n, \r, \t
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return fullText || 'No extractable text found in PDF';
  } catch (error) {
    console.error('Text extraction error:', error);
    return 'Error extracting text from PDF';
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
