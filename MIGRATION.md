# Database Migration Guide

## Issue
Your D1 database was created with an older schema and is missing the following columns:
- `parsed_metadata` - Stores error details and enhanced parsing metadata
- `parsed_structure` - Stores document structure information
- `parser_version` - Tracks parser version used
- `parse_timestamp` - When document was last parsed
- `word_count` - Total word count
- `character_count` - Total character count
- `format` - Document format (pdf, text, etc.)
- `language` - Detected language

## Quick Fix (Recommended)

Run this single command to apply all migrations:

```bash
# Make migration script executable
chmod +x scripts/migrate-database.sh

# Run migration (this will update your REMOTE production database)
./scripts/migrate-database.sh
```

The script will:
1. Check which columns are missing
2. Add only the missing columns
3. Skip columns that already exist
4. Verify the final schema

## Manual Migration (Alternative)

If you prefer to run the SQL manually:

```bash
# Add each missing column one by one
wrangler d1 execute agent-db --remote --command "ALTER TABLE documents ADD COLUMN parsed_metadata TEXT"
wrangler d1 execute agent-db --remote --command "ALTER TABLE documents ADD COLUMN parsed_structure TEXT"
wrangler d1 execute agent-db --remote --command "ALTER TABLE documents ADD COLUMN parser_version TEXT"
wrangler d1 execute agent-db --remote --command "ALTER TABLE documents ADD COLUMN parse_timestamp TEXT"
wrangler d1 execute agent-db --remote --command "ALTER TABLE documents ADD COLUMN word_count INTEGER"
wrangler d1 execute agent-db --remote --command "ALTER TABLE documents ADD COLUMN character_count INTEGER"
wrangler d1 execute agent-db --remote --command "ALTER TABLE documents ADD COLUMN format TEXT"
wrangler d1 execute agent-db --remote --command "ALTER TABLE documents ADD COLUMN language TEXT"
```

## Verify Migration

After running the migration, verify the schema:

```bash
wrangler d1 execute agent-db --remote --command "PRAGMA table_info(documents)"
```

You should see all columns including the new ones.

## Test Locally First (Optional)

If you want to test the migration locally before applying to production:

```bash
# Create a local D1 database for testing
wrangler d1 execute agent-db --local --command "PRAGMA table_info(documents)"

# Apply migration locally
wrangler d1 execute agent-db --local --command "ALTER TABLE documents ADD COLUMN parsed_metadata TEXT"
# ... (repeat for other columns)
```

## After Migration

Once the migration is complete:

1. **Verify it worked:**
   ```bash
   wrangler d1 execute agent-db --remote --command "SELECT parsed_metadata FROM documents LIMIT 1"
   ```
   This should return without error (even if the result is NULL/empty).

2. **Deploy your worker again** (if not already deployed):
   ```bash
   wrangler deploy
   ```

3. **Test document processing:**
   Upload a document and try to process it. The error should be gone!

## Rollback (if needed)

If you need to rollback (removes the columns):

```bash
# SQLite doesn't support DROP COLUMN easily, so you'd need to:
# 1. Create a new table without those columns
# 2. Copy data over
# 3. Drop old table
# 4. Rename new table

# It's easier to just leave the columns even if unused
```

## Notes

- ⚠️ **IMPORTANT**: The migration script uses `--remote` which affects your **PRODUCTION** database
- The migration is **non-destructive** - it only adds columns, doesn't remove or modify existing data
- Existing documents will have `NULL` values for the new columns until they're reprocessed
- The new validation and error handling will now work correctly
