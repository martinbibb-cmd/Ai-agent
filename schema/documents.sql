-- D1 Database Schema for Document Management
-- Run with: wrangler d1 execute agent-db --local --file=schema/documents.sql
-- Or for production: wrangler d1 execute agent-db --file=schema/documents.sql

-- Documents table - stores document metadata
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT,
  category TEXT,
  tags TEXT, -- JSON array of tags
  r2_key TEXT NOT NULL, -- R2 storage key
  page_count INTEGER,
  status TEXT DEFAULT 'processed', -- uploaded, processing, processed, error

  -- Enhanced parser fields (v2.0)
  format TEXT, -- File format detected by parser (pdf, txt, md, json, etc.)
  language TEXT, -- Detected language
  parsed_metadata TEXT, -- Full metadata JSON from parser
  parsed_structure TEXT, -- Document structure JSON from parser
  parser_version TEXT, -- Parser version used
  parse_timestamp TEXT, -- When parsing occurred
  word_count INTEGER, -- Total word count
  character_count INTEGER -- Total character count
);

-- Document pages - stores extracted text per page for better search
CREATE TABLE IF NOT EXISTS document_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  content TEXT NOT NULL, -- Extracted text from the page

  -- Enhanced parser fields (v2.0)
  page_metadata TEXT, -- Page-level metadata JSON (headers, word_count, etc.)

  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Document chunks - for semantic search (optional, for future RAG)
CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  page_number INTEGER,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Full-text search index
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  document_id,
  filename,
  content,
  content='document_pages',
  content_rowid='id'
);

-- Triggers to keep FTS index updated
CREATE TRIGGER IF NOT EXISTS documents_fts_insert AFTER INSERT ON document_pages BEGIN
  INSERT INTO documents_fts(rowid, document_id, filename, content)
  SELECT
    new.id,
    new.document_id,
    (SELECT filename FROM documents WHERE id = new.document_id),
    new.content;
END;

CREATE TRIGGER IF NOT EXISTS documents_fts_delete AFTER DELETE ON document_pages BEGIN
  DELETE FROM documents_fts WHERE rowid = old.id;
END;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_document_pages_document_id ON document_pages(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
