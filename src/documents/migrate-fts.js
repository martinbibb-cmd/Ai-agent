/**
 * Migration Script: Rebuild FTS Index for Schema v2.0
 * Run this to fix FTS table mismatches after schema updates
 */

export async function migrateFTSIndex(database) {
  console.log('Starting FTS index migration...');

  try {
    // Step 1: Drop existing FTS table and triggers
    console.log('Dropping old FTS table and triggers...');
    await database.exec(`
      DROP TRIGGER IF EXISTS documents_fts_insert;
      DROP TRIGGER IF EXISTS documents_fts_delete;
      DROP TABLE IF EXISTS documents_fts;
    `);

    // Step 2: Recreate FTS table
    console.log('Creating new FTS table...');
    await database.exec(`
      CREATE VIRTUAL TABLE documents_fts USING fts5(
        document_id,
        filename,
        content,
        content='document_pages',
        content_rowid='id'
      );
    `);

    // Step 3: Recreate triggers
    console.log('Creating new triggers...');
    await database.exec(`
      CREATE TRIGGER documents_fts_insert AFTER INSERT ON document_pages BEGIN
        INSERT INTO documents_fts(rowid, document_id, filename, content)
        SELECT
          new.id,
          new.document_id,
          (SELECT filename FROM documents WHERE id = new.document_id),
          new.content;
      END;

      CREATE TRIGGER documents_fts_delete AFTER DELETE ON document_pages BEGIN
        DELETE FROM documents_fts WHERE rowid = old.id;
      END;
    `);

    // Step 4: Rebuild index from existing data
    console.log('Rebuilding FTS index from existing documents...');
    const result = await database.prepare(`
      INSERT INTO documents_fts(rowid, document_id, filename, content)
      SELECT
        dp.id,
        dp.document_id,
        d.filename,
        dp.content
      FROM document_pages dp
      JOIN documents d ON dp.document_id = d.id
    `).run();

    console.log(`FTS index rebuilt successfully! Indexed ${result.changes || 0} pages.`);
    return { success: true, indexedPages: result.changes || 0 };

  } catch (error) {
    console.error('FTS migration failed:', error);
    throw new Error(`FTS migration failed: ${error.message}`);
  }
}

/**
 * Add this endpoint to your worker to trigger migration
 */
export async function handleFTSMigration(request, database) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const result = await migrateFTSIndex(database);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
