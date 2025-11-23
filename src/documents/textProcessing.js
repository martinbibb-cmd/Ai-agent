export async function extractTextFromFile(file) {
  const mime = file.type;

  if (mime === 'text/plain') {
    return await file.text();
  }

  if (mime === 'application/pdf') {
    // TODO: Implement real PDF parsing.
    return '[PDF text extraction not implemented yet – this is a placeholder text.]';
  }

  // Fallback: attempt to read as text
  return await file.text();
}

export function splitIntoChunks(text, chunkSize = 1500, overlap = 200) {
  const chunks = [];
  let start = 0;
  const length = text.length;

  while (start < length) {
    const end = Math.min(start + chunkSize, length);
    const chunk = text.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (end === length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }

  return chunks;
}
