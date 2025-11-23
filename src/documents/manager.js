import { DocumentParser } from './parsers/index.js';
import { validateFileSignature, detectFileType, getFileTypeName } from './fileSignature.js';

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
      console.log('Initializing document storage schema...');

      // D1 requires individual statement execution
      const statements = [
        `CREATE TABLE IF NOT EXISTS documents (
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
        )`,

        `CREATE TABLE IF NOT EXISTS document_pages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id TEXT NOT NULL,
          page_number INTEGER NOT NULL,
          content TEXT NOT NULL,
          page_metadata TEXT,
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS document_chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id TEXT NOT NULL,
          page_number INTEGER,
          chunk_text TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )`,

        `CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category)`,
        `CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)`,
        `CREATE INDEX IF NOT EXISTS idx_document_pages_document_id ON document_pages(document_id)`,
        `CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id)`
      ];

      // Execute each statement individually
      for (const statement of statements) {
        await this.db.prepare(statement).run();
      }

      // Ensure columns added in newer releases exist on older databases
      await this.ensureUpToDateSchema();

      console.log('Document storage schema initialized successfully');

      // Try to initialize FTS - this might fail if already exists, which is OK
      try {
        await this.initializeFTS();
        await this.initializeChunkFTS();
        console.log('FTS initialization completed successfully');
      } catch (ftsError) {
        console.warn('FTS initialization warning:', ftsError.message);

        // Check if FTS exists but init failed for other reasons
        const ftsHealth = await this.checkFTSHealth().catch(() => ({ exists: false }));

        if (!ftsHealth.exists) {
          console.error('FTS table does not exist and initialization failed!');
          console.error('Search functionality will not work until FTS is initialized.');
          // Don't throw - allow app to start but search won't work
        } else {
          console.log('FTS table exists, initialization skipped');
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize document schema:', error);
      console.error('Error details:', error.message, error.stack);
      throw new Error(`Document storage initialization failed: ${error.message}`);
    }
  }

  /**
   * Add any missing columns introduced in newer releases
   * This keeps older databases compatible without manual migrations
   */
  async ensureUpToDateSchema() {
    const requiredColumns = {
      format: 'TEXT',
      language: 'TEXT',
      parsed_metadata: 'TEXT',
      parsed_structure: 'TEXT',
      parser_version: 'TEXT',
      parse_timestamp: 'TEXT',
      word_count: 'INTEGER',
      character_count: 'INTEGER'
    };

    try {
      const existing = await this.db.prepare('PRAGMA table_info(documents)').all();
      const existingColumns = new Set((existing.results || []).map((col) => col.name));

      for (const [column, type] of Object.entries(requiredColumns)) {
        if (!existingColumns.has(column)) {
          console.log(`Adding missing column to documents: ${column} (${type})`);
          await this.db
            .prepare(`ALTER TABLE documents ADD COLUMN ${column} ${type}`)
            .run();
        }
      }
    } catch (error) {
      console.error('Failed to ensure up-to-date schema:', error);
      throw new Error(`Schema migration failed: ${error.message}`);
    }
  }

  /**
   * Initialize Full Text Search (FTS) tables and triggers
   */
  async initializeFTS() {
    try {
      console.log('Initializing FTS tables...');

      // Check if FTS table exists
      const tableExists = await this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'
      `).first();

      if (!tableExists) {
        console.log('Creating FTS table...');

        // Create FTS virtual table
        await this.db.prepare(`
          CREATE VIRTUAL TABLE documents_fts USING fts5(
            document_id UNINDEXED,
            filename,
            content,
            content='document_pages',
            content_rowid='id'
          )
        `).run();

        console.log('FTS table created');
      }

      // Ensure triggers exist even if table was pre-created via migrations
      const triggers = await this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='trigger' AND name IN ('documents_fts_insert', 'documents_fts_delete')
      `).all();

      const existingTriggers = new Set((triggers.results || []).map((t) => t.name));

      if (!existingTriggers.has('documents_fts_insert')) {
        console.log('Creating FTS insert trigger...');
        await this.db.prepare(`
          CREATE TRIGGER documents_fts_insert AFTER INSERT ON document_pages BEGIN
            INSERT INTO documents_fts(rowid, document_id, filename, content)
            SELECT
              new.id,
              new.document_id,
              (SELECT filename FROM documents WHERE id = new.document_id),
              new.content;
          END
        `).run();
      }

      if (!existingTriggers.has('documents_fts_delete')) {
        console.log('Creating FTS delete trigger...');
        await this.db.prepare(`
          CREATE TRIGGER documents_fts_delete AFTER DELETE ON document_pages BEGIN
            DELETE FROM documents_fts WHERE rowid = old.id;
          END
        `).run();
      }

      console.log('FTS tables and triggers are ready');
      return true;
    } catch (error) {
      console.error('FTS initialization error:', error);
      throw error;
    }
  }

  /**
   * Initialize Full Text Search for document chunks
   */
  async initializeChunkFTS() {
    try {
      console.log('Initializing chunk FTS tables...');

      // Check if chunk FTS table exists
      const tableExists = await this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='document_chunks_fts'
      `).first();

      if (!tableExists) {
        console.log('Creating chunk FTS table...');
        await this.db.prepare(`
          CREATE VIRTUAL TABLE document_chunks_fts USING fts5(
            chunk_text,
            content='document_chunks',
            content_rowid='id'
          )
        `).run();
        console.log('Chunk FTS table created');
      }

      // Ensure triggers exist
      const triggers = await this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='trigger'
          AND name IN (
            'document_chunks_ai',
            'document_chunks_ad',
            'document_chunks_au'
          )
      `).all();

      const existingTriggers = new Set((triggers.results || []).map((t) => t.name));

      if (!existingTriggers.has('document_chunks_ai')) {
        await this.db.prepare(`
          CREATE TRIGGER document_chunks_ai AFTER INSERT ON document_chunks
          BEGIN
            INSERT INTO document_chunks_fts(rowid, chunk_text)
            VALUES (new.id, new.chunk_text);
          END
        `).run();
      }

      if (!existingTriggers.has('document_chunks_ad')) {
        await this.db.prepare(`
          CREATE TRIGGER document_chunks_ad AFTER DELETE ON document_chunks
          BEGIN
            INSERT INTO document_chunks_fts(document_chunks_fts, rowid, chunk_text)
            VALUES ('delete', old.id, old.chunk_text);
          END
        `).run();
      }

      if (!existingTriggers.has('document_chunks_au')) {
        await this.db.prepare(`
          CREATE TRIGGER document_chunks_au AFTER UPDATE ON document_chunks
          BEGIN
            INSERT INTO document_chunks_fts(document_chunks_fts, rowid, chunk_text)
            VALUES ('delete', old.id, old.chunk_text);
            INSERT INTO document_chunks_fts(rowid, chunk_text)
            VALUES (new.id, new.chunk_text);
          END
        `).run();
      }

      console.log('Chunk FTS tables and triggers are ready');
      return true;
    } catch (error) {
      console.error('Chunk FTS initialization error:', error);
      throw error;
    }
  }

  /**
   * Rebuild FTS index from existing data
   */
  async rebuildFTSIndex() {
    try {
      console.log('Rebuilding FTS index...');

      // Ensure FTS schema exists before attempting to rebuild
      await this.initializeFTS();
      await this.initializeChunkFTS();

      // Clear existing FTS data
      await this.db.prepare(`DELETE FROM documents_fts`).run();
      await this.db.prepare(`DELETE FROM document_chunks_fts`).run();

      // Rebuild from document_pages
      const pages = await this.db.prepare(`
        SELECT
          dp.id as rowid,
          dp.document_id,
          d.filename,
          dp.content
        FROM document_pages dp
        JOIN documents d ON dp.document_id = d.id
      `).all();

      console.log(`Rebuilding FTS index for ${pages.results?.length || 0} pages...`);

      // Insert each page into FTS
      for (const page of (pages.results || [])) {
        await this.db.prepare(`
          INSERT INTO documents_fts(rowid, document_id, filename, content)
          VALUES (?, ?, ?, ?)
        `).bind(page.rowid, page.document_id, page.filename, page.content).run();
      }

      // Rebuild chunk FTS
      const chunks = await this.db.prepare(`
        SELECT id as rowid, chunk_text FROM document_chunks
      `).all();

      for (const chunk of (chunks.results || [])) {
        await this.db.prepare(`
          INSERT INTO document_chunks_fts(rowid, chunk_text)
          VALUES (?, ?)
        `).bind(chunk.rowid, chunk.chunk_text).run();
      }

      console.log('FTS index rebuilt successfully');
      return {
        success: true,
        pageCount: pages.results?.length || 0,
        chunkCount: chunks.results?.length || 0
      };
    } catch (error) {
      console.error('FTS rebuild error:', error);
      throw error;
    }
  }

  /**
   * Check FTS health
   */
  async checkFTSHealth() {
    try {
      // Check if FTS table exists
      const ftsTable = await this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'
      `).first();

      if (!ftsTable) {
        return {
          exists: false,
          healthy: false,
          message: 'FTS table does not exist'
        };
      }

      // Count FTS entries
      const ftsCount = await this.db.prepare(`
        SELECT COUNT(*) as count FROM documents_fts
      `).first();

      // Count document pages
      const pagesCount = await this.db.prepare(`
        SELECT COUNT(*) as count FROM document_pages
      `).first();

      // Count chunk FTS entries
      const chunkFtsCount = await this.db.prepare(`
        SELECT COUNT(*) as count FROM document_chunks_fts
      `).first();

      const chunkCount = await this.db.prepare(`
        SELECT COUNT(*) as count FROM document_chunks
      `).first();

      const healthy = ftsCount.count === pagesCount.count;

      return {
        exists: true,
        healthy,
        ftsCount: ftsCount.count,
        pagesCount: pagesCount.count,
        chunkFtsCount: chunkFtsCount.count,
        chunkCount: chunkCount.count,
        message: healthy ? 'FTS index is healthy' : 'FTS index needs rebuild'
      };
    } catch (error) {
      return {
        exists: false,
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Save prepared text chunks to the database and ensure they are indexed
   * @param {string} documentId
   * @param {string[]} chunks
   */
  async saveDocumentChunks(documentId, chunks = []) {
    await this.initialized;

    if (!documentId) {
      throw new Error('documentId is required to save chunks');
    }

    if (!Array.isArray(chunks) || chunks.length === 0) {
      return { inserted: 0 };
    }

    await this.initializeChunkFTS();

    const insertStmt = this.db.prepare(`
      INSERT INTO document_chunks (document_id, page_number, chunk_text, chunk_index)
      VALUES (?, NULL, ?, ?)
    `);

    let chunkIndex = 0;
    for (const chunk of chunks) {
      await insertStmt.bind(documentId, chunk, chunkIndex++).run();
    }

    return { inserted: chunks.length };
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

      // Get file buffer
      const fileBuffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();

      if (fileBuffer.byteLength === 0) {
        throw new Error('File is empty');
      }

      if (fileBuffer.byteLength > 50 * 1024 * 1024) { // 50MB limit
        throw new Error('File size exceeds 50MB limit');
      }

      // Validate file signature
      console.log('[DocumentManager] Validating file signature...');
      const signatureValidation = validateFileSignature(fileBuffer, metadata.contentType);
      console.log('[DocumentManager] Signature validation result:', signatureValidation);

      if (!signatureValidation.isValid && signatureValidation.validatable) {
        const error = new Error(signatureValidation.message);
        error.code = 'INVALID_FILE_SIGNATURE';
        error.detectedType = signatureValidation.detectedType;
        error.declaredType = metadata.contentType;
        throw error;
      }

      // Detect actual file type
      const detectedType = detectFileType(fileBuffer);
      console.log('[DocumentManager] Detected file type:', detectedType || 'text/unknown');

      // Warn about unsupported types
      if (detectedType && !['pdf', null].includes(detectedType)) {
        const error = new Error(
          `Unsupported file type: ${getFileTypeName(detectedType)}. Only PDF and text files are supported.`
        );
        error.code = 'UNSUPPORTED_FILE_TYPE';
        error.detectedType = detectedType;
        throw error;
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
        console.log(`Starting document parsing for ${doc.filename}`);
        parsedData = await this.parser.parse(fileBuffer, {
          name: doc.filename,
          type: doc.content_type,
          size: doc.file_size
        });
        console.log(`Document parsing completed: ${parsedData.pages.length} pages extracted`);
      } catch (error) {
        console.error('Document parsing failed:', error);

        // Mark document as error with specific error details
        await this.db.prepare(`
          UPDATE documents SET
            status = 'error',
            parsed_metadata = ?
          WHERE id = ?
        `).bind(
          JSON.stringify({
            error: {
              code: error.code || 'PARSE_ERROR',
              message: error.message,
              userMessage: error.userMessage || error.message,
              timestamp: new Date().toISOString()
            }
          }),
          documentId
        ).run();

        // Throw with appropriate user-friendly message
        const userMessage = error.userMessage || error.message;

        if (error.code === 'SIGNATURE_MISMATCH') {
          throw new Error(`File type validation failed: ${userMessage}`);
        } else if (error.code === 'UNSUPPORTED_FILE_TYPE') {
          throw new Error(`Unsupported file type: ${userMessage}`);
        } else if (error.code === 'INVALID_PDF') {
          throw new Error(`Invalid PDF file: ${userMessage}`);
        } else if (error.code === 'PDF_ENCRYPTED') {
          throw new Error('This PDF is password-protected and cannot be processed.');
        } else if (error.code === 'PDF_CORRUPTED') {
          throw new Error('This PDF appears to be corrupted or invalid.');
        } else if (error.code === 'PDF_TOO_LARGE') {
          throw new Error('This PDF is too large or complex to process.');
        } else {
          throw new Error(`Document parsing failed: ${userMessage}`);
        }
      }

      // Delete existing placeholder page content
      await this.db.prepare(`
        DELETE FROM document_pages WHERE document_id = ?
      `).bind(documentId).run();

      await this.db.prepare(`
        DELETE FROM document_chunks WHERE document_id = ?
      `).bind(documentId).run();

      // Validate that we have parseable content
      const validPages = parsedData.pages.filter(page => page.content && page.content.length > 0);

      if (validPages.length === 0) {
        // No extractable content - mark as error
        await this.db.prepare(`
          UPDATE documents SET
            status = 'error',
            parsed_metadata = ?
          WHERE id = ?
        `).bind(
          JSON.stringify({
            error: {
              code: 'NO_CONTENT',
              message: 'No extractable text content found in document',
              userMessage: 'This document appears to have no extractable text. It may be an image-only PDF or empty file.',
              timestamp: new Date().toISOString()
            }
          }),
          documentId
        ).run();

        throw new Error('No extractable text content found in document. The file may be image-only or empty.');
      }

      // Store extracted page content with metadata
      for (const page of validPages) {
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
        validPages.length, // Use actual number of pages with content
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
        pageCount: validPages.length, // Return actual page count
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

    try {
      // Check FTS health before searching
      const ftsHealth = await this.checkFTSHealth();

      if (!ftsHealth.exists) {
        console.error('[DocumentManager] FTS table does not exist');
        throw new Error('Search index is not initialized. Please contact support.');
      }

      if (!ftsHealth.healthy) {
        console.warn('[DocumentManager] FTS index is out of sync:', ftsHealth);
        // Don't throw - allow search to proceed but log warning
      }

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
    } catch (error) {
      console.error('[DocumentManager] Search error:', error);

      // If FTS query failed, try to provide helpful error
      if (error.message?.includes('no such table')) {
        throw new Error('Search index is not initialized. Please contact support.');
      }

      throw new Error(`Search failed: ${error.message}`);
    }
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

    if (!doc) {
      throw new Error('Document not found');
    }

    // Delete from R2 (with error handling to ensure DB cleanup happens)
    try {
      await this.r2.delete(doc.r2_key);
    } catch (error) {
      console.error(`Failed to delete R2 object for document ${documentId}:`, error);
      // Continue to delete from database even if R2 deletion fails
      // This prevents orphaned database records
    }

    // Delete from database (cascades to pages and chunks)
    await this.db.prepare(`
      DELETE FROM documents WHERE id = ?
    `).bind(documentId).run();

    console.log(`Document ${documentId} deleted successfully`);
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
