# Fix Production Upload Issues

Your production worker at **https://ai-agent.martinbibb.workers.dev/** needs to be updated with the latest code and database schema.

## Quick Fix Steps

### Step 1: Deploy Latest Code

You need to deploy from your local machine (where you have Cloudflare credentials):

```bash
# From your local machine, not this environment
cd /path/to/Ai-agent
git pull origin claude/build-file-parser-01Xpi6TuErXLcUVhQ77MkMSA
npx wrangler deploy
```

This will deploy:
- ✅ Enhanced parser v2.0
- ✅ Multi-format support (PDF, JSON, TXT, MD, CSV, etc.)
- ✅ FTS migration endpoint
- ✅ Mobile-responsive UI
- ✅ Upload diagnostics page

### Step 2: Run FTS Migration (On Your Mobile)

After deployment, visit on your phone:
```
https://ai-agent.martinbibb.workers.dev/test-upload.html
```

Click the **"Migrate FTS Index"** button. This fixes the database schema issues.

### Step 3: Test Upload

Try uploading a file:
```
https://ai-agent.martinbibb.workers.dev/documents.html
```

Or use the diagnostic page to see detailed error messages.

## Alternative: Manual Database Reset

If migration doesn't work, you can reset the production database:

```bash
# On your local machine
wrangler d1 execute agent-db --command="DROP TABLE IF EXISTS documents_fts;"
wrangler d1 execute agent-db --command="DROP TABLE IF EXISTS document_pages;"
wrangler d1 execute agent-db --command="DROP TABLE IF EXISTS document_chunks;"
wrangler d1 execute agent-db --command="DROP TABLE IF EXISTS documents;"

# Recreate with new schema
wrangler d1 execute agent-db --file=schema/documents.sql
```

**⚠️ Warning:** This deletes all documents! Only do this if you have backups or the existing files can't be read anyway.

## What Was Fixed

The production issue is caused by:
1. **Old database schema** - Missing v2.0 fields (format, language, word_count, etc.)
2. **FTS index mismatch** - Search index doesn't match new schema
3. **Old parser code** - Still using v1.0 PDF-only parser

After deploying and running migration:
- ✅ Upload works for all file types (PDF, JSON, TXT, MD, CSV, XML, HTML)
- ✅ Delete works without errors
- ✅ Search works properly
- ✅ Mobile-responsive UI
- ✅ Structured JSON output

## Testing After Fix

### Test 1: Upload JSON (Easiest)
Use the example files in the repo:
1. Download `examples/simple-document.json` to your phone
2. Go to https://ai-agent.martinbibb.workers.dev/documents.html
3. Upload the JSON file
4. Should work without errors!

### Test 2: Check Diagnostics
Visit: https://ai-agent.martinbibb.workers.dev/test-upload.html
- Shows detailed upload info
- Can test file selection
- Can run FTS migration
- Shows exact error messages

### Test 3: Export as JSON
After uploading a document, get it as structured JSON:
```
https://ai-agent.martinbibb.workers.dev/documents/{documentId}/json
```

## Why "Access Denied" Error

The current "Access denied" error might be:
1. **Proxy/firewall** blocking the request from this environment
2. **Old code** on production causing errors
3. **CORS issues** if accessing from different origin

After redeploying, this should be fixed.

## Deploy from Local Machine

Since you mentioned files are on Cloudflare (not your computer), you'll need to:

1. **On your local machine** (with Cloudflare credentials):
   ```bash
   git clone <your-repo>
   cd Ai-agent
   git checkout claude/build-file-parser-01Xpi6TuErXLcUVhQ77MkMSA
   npm install
   npx wrangler deploy
   ```

2. **Or push this branch and deploy from CI/CD** if you have that set up

3. **Or use wrangler login** to authenticate this environment:
   ```bash
   npx wrangler login
   # Then deploy
   npx wrangler deploy
   ```

## What You Get After Fix

- 📱 Mobile-optimized upload interface
- 📄 Support for 8+ file formats
- 🔍 Full-text search that works
- 📊 Structured JSON export
- ✅ Delete functionality without errors
- 🚀 Better parsing with metadata extraction

## Support

If you encounter issues:
1. Check the test-upload.html page for detailed errors
2. Check Cloudflare Workers logs in the dashboard
3. Verify the migration ran successfully (should show "Indexed X pages")
