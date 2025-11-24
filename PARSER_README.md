# Enhanced Document Parser System v2.0

## Overview

The enhanced document parser system provides structured JSON output for all parsed documents, supporting multiple file formats with rich metadata extraction.

## Features

### 🎯 Core Capabilities

- **Multi-Format Support**: PDF, TXT, Markdown, JSON, CSV, XML, HTML
- **Structured JSON Output**: Consistent, queryable document structure
- **Rich Metadata Extraction**: Title, author, dates, language detection
- **Intelligent Page Detection**: Better page break detection for PDFs
- **Content Structure Analysis**: Headers, sections, word counts
- **Pre-computed Text Chunks**: Ready for RAG and semantic search
- **Enhanced Search**: Full-text search with metadata filtering

### 📊 Supported File Formats

| Format | Extensions | Features |
|--------|-----------|----------|
| PDF | `.pdf` | Text extraction, metadata extraction, page detection |
| Plain Text | `.txt` | Auto-encoding detection, page splitting |
| Markdown | `.md`, `.markdown` | Header-based sections, structure preservation |
| JSON | `.json` | Structured parsing, nested object support |
| CSV | `.csv` | Header detection, row grouping |
| XML/HTML | `.xml`, `.html` | Tag-based structure detection |

## Architecture

### File Structure

```
src/documents/
├── parsers/
│   ├── base.js          # Base parser class with common utilities
│   ├── pdf.js           # Enhanced PDF parser
│   ├── text.js          # Text-based format parser
│   ├── index.js         # Parser factory and exports
│   └── legacy.js        # Backward compatibility layer
├── manager.js           # Document manager (updated for v2.0)
└── parser.js            # [DEPRECATED] Legacy parser (keep for compatibility)
```

### Parser Class Hierarchy

```
BaseParser (base.js)
├── sanitizeText()
├── chunkText()
├── countWords()
├── detectLanguage()
├── extractHeaders()
└── createMetadata()

PDFParser extends BaseParser (pdf.js)
├── extractPDFMetadata()
├── extractTextFromPDF()
├── splitIntoPages()
└── parse()

TextParser extends BaseParser (text.js)
├── detectTextFormat()
├── splitMarkdown()
├── splitJSON()
├── splitCSV()
└── parse()

DocumentParser (index.js)
└── Factory that routes to appropriate parser
```

## Usage

### Basic Parsing

```javascript
import { DocumentParser } from './src/documents/parsers/index.js';

const parser = new DocumentParser();

// Parse any supported file
const result = await parser.parse(fileBuffer, {
  name: 'document.pdf',
  type: 'application/pdf',
  size: 1024000
});

console.log(result);
```

### Output Format

All parsers return a consistent `ParsedDocument` structure:

```javascript
{
  format: 'pdf',                    // Detected format
  metadata: {
    title: 'Document Title',
    author: 'John Doe',
    created: '2024-01-15T10:00:00Z',
    modified: '2024-01-20T15:30:00Z',
    language: 'en',
    size: 1024000,
    contentType: 'application/pdf'
  },
  structure: {
    pageCount: 10,
    wordCount: 5000,
    characterCount: 30000,
    sections: ['Introduction', 'Chapter 1', 'Conclusion']
  },
  pages: [
    {
      pageNumber: 1,
      content: 'Page text content...',
      metadata: {
        headers: ['Introduction'],
        wordCount: 500,
        characterCount: 3000
      }
    }
    // ... more pages
  ],
  fullText: 'Complete document text...',
  chunks: [
    'Chunk 1 (1000 chars with 200 char overlap)...',
    'Chunk 2...'
    // ... more chunks
  ],
  parseTimestamp: '2024-01-20T16:00:00Z',
  parser: {
    name: 'PDFParser',
    version: '2.0',
    method: 'regex-based-extraction'
  }
}
```

### Using DocumentManager

```javascript
import { DocumentManager } from './src/documents/manager.js';

const manager = new DocumentManager(r2Bucket, database);

// Upload document
const uploaded = await manager.uploadDocument(file, {
  filename: 'manual.pdf',
  contentType: 'application/pdf',
  category: 'manuals',
  tags: ['heating', 'boiler']
});

// Process document (extract text and structure)
const processed = await manager.processDocument(uploaded.id);

// Get structured JSON
const json = await manager.getDocumentJSON(uploaded.id);
console.log(json.format);           // 'pdf'
console.log(json.structure);        // { pageCount, wordCount, ... }
console.log(json.pages[0].content); // First page text
```

### API Endpoints

#### Upload Document
```http
POST /documents/upload
Content-Type: multipart/form-data

file: <file>
category: 'manuals'
tags: ["boiler", "heating"]
```

#### Process Document
```http
POST /documents/{documentId}/process
```

#### Get Document as JSON
```http
GET /documents/{documentId}/json
```

Response:
```json
{
  "id": "doc_123",
  "format": "pdf",
  "metadata": { ... },
  "structure": { ... },
  "pages": [ ... ],
  "fullText": "...",
  "parser": { "version": "2.0" }
}
```

#### List Documents
```http
GET /documents?category=manuals&limit=50
```

#### Delete Document
```http
DELETE /documents/{documentId}
```

## Database Schema

### Documents Table (Enhanced v2.0)

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT,
  category TEXT,
  tags TEXT,                    -- JSON array
  r2_key TEXT NOT NULL,
  page_count INTEGER,
  status TEXT DEFAULT 'processed',

  -- Enhanced v2.0 fields
  format TEXT,                  -- pdf, txt, md, json, etc.
  language TEXT,                -- Detected language
  parsed_metadata TEXT,         -- Full metadata JSON
  parsed_structure TEXT,        -- Document structure JSON
  parser_version TEXT,          -- Parser version used
  parse_timestamp TEXT,         -- When parsing occurred
  word_count INTEGER,           -- Total word count
  character_count INTEGER       -- Total character count
);
```

### Document Pages Table (Enhanced v2.0)

```sql
CREATE TABLE document_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  content TEXT NOT NULL,

  -- Enhanced v2.0 fields
  page_metadata TEXT,           -- Page-level metadata JSON

  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

## Format-Specific Features

### PDF Parser

**Capabilities:**
- Extract metadata from PDF Info dictionary
- Decode PDF date format (D:YYYYMMDDHHmmSS)
- Extract text from BT...ET blocks
- Handle Tj and TJ operators
- Decode octal escape sequences
- Detect page breaks
- Estimate page count from PDF structure

**Metadata Extracted:**
- Title, Author, Subject
- Creator, Producer
- Creation Date, Modification Date
- Keywords
- PDF Version

**Example:**
```javascript
const pdfParser = new PDFParser();
const result = await pdfParser.parse(pdfBuffer, fileInfo);

console.log(result.metadata.author);    // 'John Doe'
console.log(result.metadata.pdfVersion); // '1.7'
console.log(result.pages.length);       // 25
```

### Text Parser

**Capabilities:**
- Auto-detect encoding (UTF-8, Latin1, Windows-1252)
- Detect format by content and extension
- Smart splitting by structure:
  - Markdown: Split by headers
  - JSON: Split by top-level keys or array items
  - CSV: Group rows with headers
  - Plain text: Split by character count with paragraph boundaries

**Example:**
```javascript
const textParser = new TextParser();

// Markdown
const mdResult = await textParser.parse(mdBuffer, {
  name: 'README.md',
  type: 'text/markdown'
});
console.log(mdResult.format);           // 'markdown'
console.log(mdResult.pages[0].metadata.headers); // ['# Introduction']

// JSON
const jsonResult = await textParser.parse(jsonBuffer, {
  name: 'data.json',
  type: 'application/json'
});
console.log(jsonResult.format);         // 'json'
console.log(jsonResult.pages.length);   // Number of top-level keys
```

## Migration from v1.0

### Backward Compatibility

The legacy parser exports are maintained for backward compatibility:

```javascript
// Old way (still works)
import { parsePDF, sanitizeTextForSQL, chunkText } from './src/documents/parser.js';

// These are now wrappers around the new parsers
const result = await parsePDF(pdfBuffer);
```

### Recommended Migration

```javascript
// New way (recommended)
import { DocumentParser } from './src/documents/parsers/index.js';

const parser = new DocumentParser();
const result = await parser.parse(buffer, fileInfo);

// More structured output
console.log(result.structure);
console.log(result.metadata);
console.log(result.chunks);
```

### Database Migration

The schema is backward compatible. New fields are optional:

```sql
-- Existing documents will have NULL values for new fields
-- They will be populated when documents are reprocessed
SELECT format, language, word_count FROM documents WHERE id = 'doc_123';
-- format: NULL (or actual value if reprocessed)
```

To update existing documents:
```javascript
// Reprocess all documents to populate new fields
const documents = await manager.listDocuments();
for (const doc of documents) {
  await manager.processDocument(doc.id);
}
```

## Configuration Options

### Parser Options

```javascript
const parser = new DocumentParser({
  chunkSize: 1000,      // Characters per chunk (default: 1000)
  chunkOverlap: 200,    // Overlap between chunks (default: 200)
  pageSize: 2000        // Characters per page for text files (default: 2000)
});
```

### Text Sanitization

All text is automatically sanitized for SQL compatibility:
- Removes non-printable characters
- Normalizes quotes and apostrophes
- Normalizes dashes
- Removes zero-width characters
- Collapses multiple spaces

## Performance Considerations

### Memory Usage
- PDFs are loaded entirely into memory
- Large files (>24MB) may cause Worker timeouts
- Consider splitting very large documents

### Processing Time
- PDF parsing: ~1-5 seconds for typical documents
- Text parsing: <1 second for most files
- Database storage: ~100ms per page

### Optimization Tips
1. Use chunking for better search granularity
2. Process documents asynchronously
3. Cache parsed results in database
4. Use FTS5 for fast full-text search

## Error Handling

All parsers include robust error handling:

```javascript
try {
  const result = await parser.parse(buffer, fileInfo);

  if (result.error) {
    console.error('Parsing error:', result.error);
    // Fallback document structure is still returned
  }
} catch (error) {
  console.error('Fatal error:', error);
}
```

Even on error, parsers return a safe fallback structure:
```javascript
{
  format: 'unknown',
  metadata: { ... },
  structure: { pageCount: 0, wordCount: 0 },
  pages: [],
  fullText: '',
  chunks: [],
  error: {
    message: 'Error description',
    type: 'parsing_error'
  }
}
```

## Testing

### Manual Testing

```javascript
// Test PDF parsing
const pdfBuffer = await readFile('test.pdf');
const parser = new DocumentParser();
const result = await parser.parse(pdfBuffer, {
  name: 'test.pdf',
  type: 'application/pdf',
  size: pdfBuffer.byteLength
});

console.log('Format:', result.format);
console.log('Pages:', result.structure.pageCount);
console.log('Words:', result.structure.wordCount);
console.log('Language:', result.metadata.language);
```

### Validation

```javascript
// Validate output structure
function validateParsedDocument(doc) {
  assert(doc.format);
  assert(doc.metadata);
  assert(doc.structure);
  assert(Array.isArray(doc.pages));
  assert(Array.isArray(doc.chunks));
  assert(doc.fullText);
  assert(doc.parseTimestamp);
}
```

## Troubleshooting

### PDF Text Extraction Issues

**Problem**: No text extracted from PDF
**Cause**: Scanned PDFs or image-based PDFs
**Solution**: OCR not currently supported. Consider preprocessing with OCR tool.

**Problem**: Garbled text
**Cause**: Complex PDF encoding or fonts
**Solution**: Parser uses Latin1 decoding. May need additional encoding support.

**Problem**: Poor page breaks
**Cause**: Character-based splitting fallback
**Solution**: Look for page markers in text. Parser tries to detect "Page X" patterns.

### Database Issues

**Problem**: SQL errors with special characters
**Cause**: Insufficient sanitization
**Solution**: Text is sanitized by default. Report any escaping issues.

**Problem**: FTS search not working
**Cause**: Schema not initialized
**Solution**: DocumentManager auto-initializes schema. Check logs.

## Future Enhancements

- [ ] OCR support for scanned PDFs
- [ ] DOCX/DOC parsing
- [ ] EPUB parsing
- [ ] Table extraction from PDFs
- [ ] Image extraction and analysis
- [ ] Semantic chunking (not just character-based)
- [ ] Vector embeddings for semantic search
- [ ] Multi-language support improvements
- [ ] Streaming for large files

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the error messages and fallback documents
3. Enable debug logging: `console.log(result)`
4. Report issues with sample files (if non-confidential)

## License

Same as parent project.

---

**Version**: 2.0
**Last Updated**: 2024-01-20
**Compatibility**: Works with existing v1.0 documents
