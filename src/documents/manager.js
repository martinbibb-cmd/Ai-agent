import { DocumentParser } from './parsers/index.js';

/**
 * Document Manager - handles document upload, storage, and retrieval
 * Version 2.0 - Enhanced with structured JSON parsing
 */
export class DocumentManager {
  constructor(r2Bucket, database) {
    this.r2 = r2Bucket;
    this.db = database;
    this.parser = new DocumentParser();
    this.initialized = this.initialize();
  }

  async initialize() {
    try {
      const schema = `
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          filename TEXT NOT NULL,
          original_filename TEXT NOT NULL,
          content_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          uploaded_at TEXT NOT NULL,
          uploaded_by TEXT,
          category TEXT,
          tags TEXT,
          r2_key TEXT NOT NULL,
          page_count INTEGER,
          status TEXT DEFAULT 'processed',

          format TEXT,
          language TEXT,
          parsed_metadata TEXT,
          parsed_structure TEXT,
          parser_version TEXT,
          parse_timestamp TEXT,
          word_count INTEGER,
          character_count INTEGER
        );

        CREATE TABLE IF NOT EXISTS document_pages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id TEXT NOT NULL,
          page_number INTEGER NOT NULL,
          content TEXT NOT NULL,
          page_metadata TEXT,
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS document_chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id TEXT NOT NULL,
          page_number INTEGER,
          chunk_text TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
          document_id,
          filename,
          content,
          content='document_pages',
          content_rowid='id'
        );

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

        CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
        CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
        CREATE INDEX IF NOT EXISTS idx_document_pages_document_id ON document_pages(document_id);
        CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
      `;

      await this.db.exec(schema);
    } catch (error) {
      console.error('Failed to initialize document schema:', error);
      throw new Error('Document storage is not configured correctly.');
    }
  }

  /**
   * Upload and process a document
   * @param {File|ArrayBuffer} file
   * @param {Object} metadata - {filename, contentType, uploadedBy, category, tags}
   * @returns {Promise<{id: string, filename: string, pageCount: number}>}
   */
  async uploadDocument(file, metadata) {
    await this.initialized;
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const r2Key = `documents/${documentId}`;

    try {
      // Validate file
      if (!file) {
        throw new Error('No file provided');
      }

      if (!metadata?.filename) {
        throw new Error('Filename is required');
      }

      // Store file in R2
      const fileBuffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();

      if (fileBuffer.byteLength === 0) {
        throw new Error('File is empty');
      }

      if (fileBuffer.byteLength > 50 * 1024 * 1024) { // 50MB limit
        throw new Error('File size exceeds 50MB limit');
      }

      console.log(`Uploading document ${documentId} to R2 bucket (${fileBuffer.byteLength} bytes)`);

      await this.r2.put(r2Key, fileBuffer, {
        httpMetadata: {
          contentType: metadata.contentType || 'application/pdf',
        },
        customMetadata: {
          originalFilename: metadata.filename,
          uploadedAt: new Date().toISOString(),
        }
      });

      console.log(`Document ${documentId} uploaded to R2 successfully`);

      // Sanitize filename to prevent SQL issues
      const cleanFilename = metadata.filename
        .replace(/[^\x20-\x7E]/g, '_') // Replace non-ASCII with underscore
        .replace(/['"]/g, '') // Remove quotes
        .trim();

      // Store document metadata WITHOUT text extraction
      await this.db.prepare(`
        INSERT INTO documents (
          id, filename, original_filename, content_type, file_size,
          uploaded_at, uploaded_by, category, tags, r2_key, page_count, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        documentId,
        cleanFilename,
        cleanFilename,
        metadata.contentType || 'application/pdf',
        fileBuffer.byteLength,
        new Date().toISOString(),
        metadata.uploadedBy || null,
        metadata.category || 'general',
        JSON.stringify(metadata.tags || []),
        r2Key,
        1, // Default page count
        'uploaded' // Status: uploaded but not processed
      ).run();

      console.log(`Document ${documentId} metadata saved to database`);

      // Store a simple placeholder in document_pages
      await this.db.prepare(`
        INSERT INTO document_pages (document_id, page_number, content)
        VALUES (?, ?, ?)
      `).bind(documentId, 1, `Document: ${metadata.filename} (text extraction pending)`).run();

      return {
        id: documentId,
        filename: metadata.filename,
        pageCount: 1,
        status: 'uploaded'
      };

    } catch (error) {
      console.error('Document upload error:', error);

      // Clean up R2 if it was uploaded
      try {
        await this.r2.delete(r2Key);
      } catch (e) {
        console.error('Failed to clean up R2 object:', e);
      }

      // Mark as error if metadata was created
      try {
        await this.db.prepare(`
          UPDATE documents SET status = 'error' WHERE id = ?
        `).bind(documentId).run();
      } catch (e) {
        // Ignore if document wasn't created yet
      }

      throw new Error(`Failed to upload document: ${error.message}`);
    }
  }

  /**
   * Process an uploaded document to extract text and structure
   * Version 2.0 - Uses enhanced parser with structured JSON output
   * @param {string} documentId
   * @returns {Promise<{id: string, filename: string, pageCount: number, status: string, format: string}>}
   */
  async processDocument(documentId) {
    await this.initialized;
    try {
      console.log(`Processing document ${documentId}`);

      // Get the document from database
      const doc = await this.db.prepare(`
        SELECT * FROM documents WHERE id = ?
      `).bind(documentId).first();

      if (!doc) {
        throw new Error('Document not found');
      }

      console.log(`Found document: ${doc.filename} (${doc.content_type})`);

      // Get the file from R2
      const fileBuffer = await this.getDocumentFile(documentId);
      console.log(`Retrieved file from R2: ${fileBuffer.byteLength} bytes`);

      // Parse document with enhanced parser
      let parsedData;
      try {
        console.log(`Starting PDF parsing for ${doc.filename}`);
        parsedData = await this.parser.parse(fileBuffer, {
          name: doc.filename,
          type: doc.content_type,
          size: doc.file_size
        });
        console.log(`PDF parsing completed: ${parsedData.pages.length} pages extracted`);
      } catch (error) {
        console.error('Document parsing failed:', error);
        // Mark as error
        await this.db.prepare(`
          UPDATE documents SET status = 'error' WHERE id = ?
        `).bind(documentId).run();
        throw new Error(`PDF parsing failed: ${error.message}. This could be due to: corrupted PDF, encrypted PDF, or unsupported PDF format.`);
      }

      // Delete existing placeholder page content
      await this.db.prepare(`
        DELETE FROM document_pages WHERE document_id = ?
      `).bind(documentId).run();

      await this.db.prepare(`
        DELETE FROM document_chunks WHERE document_id = ?
      `).bind(documentId).run();

      // Store extracted page content with metadata
      for (const page of parsedData.pages) {
        if (!page.content || page.content.length === 0) continue;

        await this.db.prepare(`
          INSERT INTO document_pages (document_id, page_number, content, page_metadata)
          VALUES (?, ?, ?, ?)
        `).bind(
          documentId,
          page.pageNumber,
          page.content,
          JSON.stringify(page.metadata || {})
        ).run();
      }

      // Store pre-computed chunks for better search
      const chunks = parsedData.chunks || [];
      for (let i = 0; i < chunks.length; i++) {
        if (chunks[i] && chunks[i].trim().length > 0) {
          await this.db.prepare(`
            INSERT INTO document_chunks (document_id, page_number, chunk_text, chunk_index)
            VALUES (?, ?, ?, ?)
          `).bind(documentId, null, chunks[i].trim(), i).run();
        }
      }

      // Update document with enhanced metadata
      await this.db.prepare(`
        UPDATE documents SET
          status = 'processed',
          page_count = ?,
          format = ?,
          language = ?,
          parsed_metadata = ?,
          parsed_structure = ?,
          parser_version = ?,
          parse_timestamp = ?,
          word_count = ?,
          character_count = ?
        WHERE id = ?
      `).bind(
        parsedData.structure.pageCount,
        parsedData.format || 'unknown',
        parsedData.metadata.language || 'unknown',
        JSON.stringify(parsedData.metadata),
        JSON.stringify(parsedData.structure),
        parsedData.parser?.version || '2.0',
        parsedData.parseTimestamp || new Date().toISOString(),
        parsedData.structure.wordCount || 0,
        parsedData.structure.characterCount || 0,
        documentId
      ).run();

      return {
        id: documentId,
        filename: doc.filename,
        pageCount: parsedData.structure.pageCount,
        status: 'processed',
        format: parsedData.format,
        wordCount: parsedData.structure.wordCount,
        language: parsedData.metadata.language
      };

    } catch (error) {
      console.error('Document processing error:', error);
      throw new Error(`Failed to process document: ${error.message}`);
    }
  }

  /**
   * Search documents by text query
   * @param {string} query
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async searchDocuments(query, limit = 10) {
    await this.initialized;
    const results = await this.db.prepare(`
      SELECT
        d.id,
        d.filename,
        d.category,
        d.uploaded_at,
        dp.page_number,
        dp.content,
        snippet(documents_fts, 2, '<mark>', '</mark>', '...', 64) as snippet
      FROM documents_fts
      JOIN document_pages dp ON documents_fts.rowid = dp.id
      JOIN documents d ON dp.document_id = d.id
      WHERE documents_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).bind(query, limit).all();

    return results.results || [];
  }

  /**
   * Get document by ID
   * @param {string} documentId
   * @returns {Promise<Object>}
   */
  async getDocument(documentId) {
    await this.initialized;
    const doc = await this.db.prepare(`
      SELECT * FROM documents WHERE id = ?
    `).bind(documentId).first();

    if (!doc) {
      throw new Error('Document not found');
    }

    const pages = await this.db.prepare(`
      SELECT page_number, content, page_metadata
      FROM document_pages
      WHERE document_id = ?
      ORDER BY page_number
    `).bind(documentId).all();

    // Parse JSON fields
    const parsedPages = (pages.results || []).map(page => ({
      pageNumber: page.page_number,
      content: page.content,
      metadata: page.page_metadata ? JSON.parse(page.page_metadata) : {}
    }));

    return {
      ...doc,
      pages: parsedPages,
      tags: JSON.parse(doc.tags || '[]'),
      parsed_metadata: doc.parsed_metadata ? JSON.parse(doc.parsed_metadata) : null,
      parsed_structure: doc.parsed_structure ? JSON.parse(doc.parsed_structure) : null
    };
  }

  /**
   * Get document as structured JSON (enhanced v2.0 format)
   * @param {string} documentId
   * @returns {Promise<ParsedDocument>}
   */
  async getDocumentJSON(documentId) {
    await this.initialized;
    const doc = await this.getDocument(documentId);

    // Return structured format matching parser output
    return {
      id: doc.id,
      format: doc.format || 'unknown',
      metadata: doc.parsed_metadata || {
        title: doc.filename,
        author: null,
        created: null,
        modified: null,
        language: doc.language || 'unknown',
        size: doc.file_size,
        contentType: doc.content_type
      },
      structure: doc.parsed_structure || {
        pageCount: doc.page_count || 0,
        wordCount: doc.word_count || 0,
        characterCount: doc.character_count || 0,
        sections: []
      },
      pages: doc.pages,
      fullText: doc.pages.map(p => p.content).join('\n\n'),
      uploadedAt: doc.uploaded_at,
      uploadedBy: doc.uploaded_by,
      category: doc.category,
      tags: doc.tags,
      status: doc.status,
      parser: {
        version: doc.parser_version || '1.0',
        timestamp: doc.parse_timestamp
      }
    };
  }

  /**
   * List all documents
   * @param {Object} filters - {category, limit, offset}
   * @returns {Promise<Array>}
   */
  async listDocuments(filters = {}) {
    await this.initialized;
    try {
      let query = `
        SELECT id, filename, original_filename, content_type, file_size,
               uploaded_at, uploaded_by, category, tags, page_count, status
        FROM documents
        WHERE 1=1
      `;

      const params = [];

      if (filters.category) {
        query += ` AND category = ?`;
        params.push(filters.category);
      }

      query += ` ORDER BY uploaded_at DESC LIMIT ? OFFSET ?`;
      params.push(filters.limit || 50, filters.offset || 0);

      const results = await this.db.prepare(query).bind(...params).all();

      return (results.results || []).map(doc => {
        try {
          return {
            ...doc,
            tags: JSON.parse(doc.tags || '[]')
          };
        } catch (e) {
          // If tags parsing fails, return empty array
          console.error('Failed to parse tags for document:', doc.id, e);
          return {
            ...doc,
            tags: []
          };
        }
      });
    } catch (error) {
      console.error('Error listing documents:', error);
      throw new Error('Failed to fetch documents');
    }
  }

  /**
   * Delete a document
   * @param {string} documentId
   */
  async deleteDocument(documentId) {
    await this.initialized;
    const doc = await this.getDocument(documentId);

    // Delete from R2
    await this.r2.delete(doc.r2_key);

    // Delete from database (cascades to pages and chunks)
    await this.db.prepare(`
      DELETE FROM documents WHERE id = ?
    `).bind(documentId).run();
  }

  /**
   * Get document content from R2
   * @param {string} documentId
   * @returns {Promise<ArrayBuffer>}
   */
  async getDocumentFile(documentId) {
    await this.initialized;
    const doc = await this.db.prepare(`
      SELECT r2_key FROM documents WHERE id = ?
    `).bind(documentId).first();

    if (!doc) {
      throw new Error('Document not found');
    }

    const object = await this.r2.get(doc.r2_key);

    if (!object) {
      throw new Error('Document file not found in storage');
    }

    return await object.arrayBuffer();
  }
}
