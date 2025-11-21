import { parsePDF, extractTextFallback, chunkText } from './parser.js';

/**
 * Document Manager - handles document upload, storage, and retrieval
 */
export class DocumentManager {
  constructor(r2Bucket, database) {
    this.r2 = r2Bucket;
    this.db = database;
  }

  /**
   * Upload and process a document
   * @param {File|ArrayBuffer} file
   * @param {Object} metadata - {filename, contentType, uploadedBy, category, tags}
   * @returns {Promise<{id: string, filename: string, pageCount: number}>}
   */
  async uploadDocument(file, metadata) {
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const r2Key = `documents/${documentId}`;

    try {
      // Store file in R2
      const fileBuffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
      await this.r2.put(r2Key, fileBuffer, {
        httpMetadata: {
          contentType: metadata.contentType || 'application/pdf',
        },
        customMetadata: {
          originalFilename: metadata.filename,
          uploadedAt: new Date().toISOString(),
        }
      });

      // Store document metadata WITHOUT text extraction
      await this.db.prepare(`
        INSERT INTO documents (
          id, filename, original_filename, content_type, file_size,
          uploaded_at, uploaded_by, category, tags, r2_key, page_count, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        documentId,
        metadata.filename,
        metadata.filename,
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
   * Process an uploaded document to extract text
   * @param {string} documentId
   * @returns {Promise<{id: string, filename: string, pageCount: number, status: string}>}
   */
  async processDocument(documentId) {
    try {
      // Get the document from database
      const doc = await this.db.prepare(`
        SELECT * FROM documents WHERE id = ?
      `).bind(documentId).first();

      if (!doc) {
        throw new Error('Document not found');
      }

      // Get the file from R2
      const fileBuffer = await this.getDocumentFile(documentId);

      // Parse PDF with text extraction
      let parsedData;
      try {
        parsedData = await parsePDF(fileBuffer);
      } catch (error) {
        console.error('PDF parsing failed:', error);
        // Mark as error
        await this.db.prepare(`
          UPDATE documents SET status = 'error' WHERE id = ?
        `).bind(documentId).run();
        throw error;
      }

      // Delete existing placeholder page content
      await this.db.prepare(`
        DELETE FROM document_pages WHERE document_id = ?
      `).bind(documentId).run();

      await this.db.prepare(`
        DELETE FROM document_chunks WHERE document_id = ?
      `).bind(documentId).run();

      // Store extracted page content
      for (const page of parsedData.pages) {
        if (!page.text || page.text.length === 0) continue;

        await this.db.prepare(`
          INSERT INTO document_pages (document_id, page_number, content)
          VALUES (?, ?, ?)
        `).bind(documentId, page.pageNumber, page.text).run();

        // Store chunks for better search
        const chunks = chunkText(page.text);
        for (let i = 0; i < chunks.length; i++) {
          if (chunks[i] && chunks[i].trim().length > 0) {
            await this.db.prepare(`
              INSERT INTO document_chunks (document_id, page_number, chunk_text, chunk_index)
              VALUES (?, ?, ?, ?)
            `).bind(documentId, page.pageNumber, chunks[i].trim(), i).run();
          }
        }
      }

      // Update document status to processed
      await this.db.prepare(`
        UPDATE documents SET status = 'processed', page_count = ? WHERE id = ?
      `).bind(parsedData.pageCount, documentId).run();

      return {
        id: documentId,
        filename: doc.filename,
        pageCount: parsedData.pageCount,
        status: 'processed'
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
    const doc = await this.db.prepare(`
      SELECT * FROM documents WHERE id = ?
    `).bind(documentId).first();

    if (!doc) {
      throw new Error('Document not found');
    }

    const pages = await this.db.prepare(`
      SELECT page_number, content
      FROM document_pages
      WHERE document_id = ?
      ORDER BY page_number
    `).bind(documentId).all();

    return {
      ...doc,
      pages: pages.results || [],
      tags: JSON.parse(doc.tags || '[]')
    };
  }

  /**
   * List all documents
   * @param {Object} filters - {category, limit, offset}
   * @returns {Promise<Array>}
   */
  async listDocuments(filters = {}) {
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

    return (results.results || []).map(doc => ({
      ...doc,
      tags: JSON.parse(doc.tags || '[]')
    }));
  }

  /**
   * Delete a document
   * @param {string} documentId
   */
  async deleteDocument(documentId) {
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
