# FTS Migration Guide

## Problem: "no such column: T.filename" Error

This error occurs when the Full-Text Search (FTS) virtual table is out of sync with the updated schema. This typically happens after schema updates when the FTS index wasn't rebuilt.

## Solution: Rebuild the FTS Index

### Option 1: Run Migration via API (Recommended)

This rebuilds the FTS index without losing any data.

**Step 1: Deploy your updated code**
```bash
# Deploy to Cloudflare Workers
wrangler deploy
```

**Step 2: Run the migration**
```bash
# Trigger the FTS migration endpoint
curl -X POST https://your-worker.workers.dev/documents/migrate-fts
```

Or if running locally:
```bash
curl -X POST http://localhost:8787/documents/migrate-fts
```

**Expected Response:**
```json
{
  "success": true,
  "indexedPages": 42
}
```

This will:
1. Drop the old FTS table and triggers
2. Create new FTS table matching the v2.0 schema
3. Recreate the triggers
4. Rebuild the index from all existing documents

**Step 3: Verify it worked**
```bash
# Try deleting a document
curl -X DELETE http://localhost:8787/documents/{documentId}

# Try searching
curl "http://localhost:8787/documents?limit=10"
```

### Option 2: Manual Database Reset (Nuclear Option)

⚠️ **Warning**: This will delete all documents. Only use if you have backups.

**Step 1: Export existing documents as JSON**
```bash
# Get list of documents
curl http://localhost:8787/documents > documents.json

# Export each document
for doc_id in $(cat documents.json | jq -r '.documents[].id'); do
  curl "http://localhost:8787/documents/${doc_id}/json" > "${doc_id}.json"
done
```

**Step 2: Reset the database**
```bash
# For local development
wrangler d1 execute agent-db --local --command="DROP TABLE documents_fts; DROP TABLE document_pages; DROP TABLE document_chunks; DROP TABLE documents;"

# Recreate schema
wrangler d1 execute agent-db --local --file=schema/documents.sql
```

**Step 3: Re-upload documents**
After resetting, upload your documents again using the upload API.

### Option 3: Run Migration Programmatically

If you need to run the migration from code:

```javascript
import { migrateFTSIndex } from './src/documents/migrate-fts.js';

// In your worker or script
const result = await migrateFTSIndex(env.DB);
console.log(`Migrated ${result.indexedPages} pages`);
```

## Prevention

To avoid this issue in the future:

1. **Always run migrations after schema changes**
   - After updating `schema/documents.sql`, run the migration
   - Test locally before deploying to production

2. **Version your schema**
   - Keep track of schema version in the database
   - Create migration scripts for each version

3. **Test before deploying**
   - Run `wrangler dev` locally
   - Test document upload, search, and delete
   - Only deploy after verifying everything works

## Troubleshooting

### Migration fails with "table already exists"

The FTS table might be locked. Try:
```bash
# Restart your local worker
# Press Ctrl+C to stop wrangler dev
# Then start again
wrangler dev
```

### Migration succeeds but search still fails

Clear your browser cache and restart the worker:
```bash
wrangler dev --local-protocol=https
```

### Documents are missing after migration

The migration doesn't delete documents, only rebuilds the search index. Check:
```bash
curl http://localhost:8787/documents
```

If documents are truly missing, restore from backups.

## What Gets Migrated

### ✅ Preserved
- All documents in the `documents` table
- All document pages and content
- Document chunks
- R2 storage files
- All metadata

### 🔄 Rebuilt
- FTS (Full-Text Search) index
- FTS triggers
- Search index entries

### ❌ Not Affected
- R2 stored files (PDFs, etc.)
- Document metadata
- Upload history

## After Migration

Once migration is complete:

1. **Test search functionality**
   ```bash
   # Search should work without errors
   curl "http://localhost:8787/documents?search=boiler"
   ```

2. **Test document operations**
   ```bash
   # Upload should work
   curl -X POST http://localhost:8787/documents/upload -F "file=@test.pdf"

   # Process should work
   curl -X POST http://localhost:8787/documents/{id}/process

   # Delete should work
   curl -X DELETE http://localhost:8787/documents/{id}
   ```

3. **Verify in UI**
   - Open your document manager UI
   - Try uploading a document
   - Try searching
   - Try deleting

## Support

If you encounter issues:

1. Check the worker logs:
   ```bash
   wrangler tail
   ```

2. Verify the schema:
   ```bash
   wrangler d1 execute agent-db --local --command="SELECT sql FROM sqlite_master WHERE type='table';"
   ```

3. Check FTS table specifically:
   ```bash
   wrangler d1 execute agent-db --local --command="SELECT * FROM sqlite_master WHERE name='documents_fts';"
   ```

## Schema Version Tracking (Future Enhancement)

Consider adding a schema version table:

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  description TEXT
);

INSERT INTO schema_version VALUES ('2.0', datetime('now'), 'Enhanced parser with JSON output');
```

This helps track which migrations have been applied.
