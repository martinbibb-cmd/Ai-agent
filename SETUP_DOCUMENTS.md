# Document Management Setup Guide

This guide explains how to set up the document management system for the AI Agent.

## Overview

The document system allows users to:
- Upload PDF files (manuals, specifications, guides)
- Automatically extract and index text content
- Search documents via natural language
- Reference document content in agent conversations

## Architecture

- **R2**: Cloudflare R2 bucket for secure PDF storage
- **D1**: Cloudflare D1 database for metadata and searchable text
- **Parser**: PDF.js for text extraction
- **Search**: Full-text search using SQLite FTS5

## Setup Steps

### 1. Create R2 Bucket

```bash
# Create the R2 bucket for document storage
wrangler r2 bucket create agent-documents
```

This creates a private S3-compatible bucket for storing PDF files securely.

### 2. Create D1 Database

```bash
# Create the D1 database
wrangler d1 create agent-db

# Note the database_id from the output and update wrangler.toml
```

Update `wrangler.toml` with the database ID:
```toml
[[d1_databases]]
binding = "DB"
database_name = "agent-db"
database_id = "YOUR_DATABASE_ID_HERE"  # Replace with actual ID
```

### 3. Initialize Database Schema

```bash
# Apply the schema locally for development
wrangler d1 execute agent-db --local --file=schema/documents.sql

# Apply the schema to production
wrangler d1 execute agent-db --file=schema/documents.sql
```

This creates the necessary tables:
- `documents` - Document metadata
- `document_pages` - Extracted text per page
- `document_chunks` - Text chunks for search
- `documents_fts` - Full-text search index

### 4. Install Dependencies

```bash
npm install
```

This installs:
- `pdfjs-dist` - PDF parsing library
- `@anthropic-ai/sdk` - Claude API client

### 5. Deploy

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

## API Endpoints

### Upload Document
```bash
POST /documents/upload

# Form data
- file: PDF file (max 24MB)
- category: Category (general, manuals, specs, guides, regulations)
- tags: JSON array of tags
```

### List Documents
```bash
GET /documents?category=manuals&limit=20
```

### Delete Document
```bash
DELETE /documents/{document_id}
```

## Frontend Access

- **Chat Interface**: https://your-worker.workers.dev/
- **Document Manager**: https://your-worker.workers.dev/documents.html

## Agent Tools

Once documents are uploaded, the agent can use these tools:

### search_documents
```json
{
  "query": "What is the efficiency rating?",
  "limit": 10
}
```

Returns relevant excerpts from uploaded documents.

### list_documents
```json
{
  "category": "manuals",
  "limit": 20
}
```

Lists all available documents.

## Security

- **R2 Buckets**: Private by default, only accessible via Worker
- **D1 Database**: Isolated per Worker, no public access
- **File Uploads**: Validated for PDF type and size limits
- **Access Control**: All requests go through Worker authentication

## Storage Limits

- **R2**: 10 GB free, then $0.015/GB/month
- **D1**: 5 GB free, then $0.75/GB/month
- **Worker**: 100,000 requests/day free

## Troubleshooting

### "Document storage not configured"
- Ensure R2 bucket exists: `wrangler r2 bucket list`
- Ensure D1 database exists: `wrangler d1 list`
- Check wrangler.toml bindings are correct

### "Failed to parse PDF"
- Ensure file is a valid PDF
- Check file size is under 24MB
- Try re-uploading the file

### Search not returning results
- Ensure schema was applied: check `documents_fts` table exists
- Verify documents were indexed: check `document_pages` table
- Try broader search terms

## Development

### Local Testing

```bash
# Start local development server
npm run dev

# Upload a test document
curl -X POST http://localhost:8787/documents/upload \
  -F "file=@test.pdf" \
  -F "category=test"
```

### Database Inspection

```bash
# Query documents locally
wrangler d1 execute agent-db --local --command="SELECT * FROM documents"

# Query in production
wrangler d1 execute agent-db --command="SELECT * FROM documents"
```

## Cost Estimation

For typical usage (100 documents, 5000 searches/month):
- R2 Storage: ~$0.15/month
- D1 Storage: ~$0.75/month
- Workers Requests: Free (under 100k/day)

**Total**: ~$0.90/month

## Next Steps

1. Upload your first documents via the Document Manager UI
2. Test search functionality in the chat interface
3. Ask the agent questions about uploaded content
4. Monitor usage in Cloudflare dashboard

## Example Queries

Once documents are uploaded, you can ask:
- "What's in the Worcester Bosch manual about efficiency?"
- "Search the installation guide for pipe sizing requirements"
- "What documents do we have about combi boilers?"
- "Find the warranty information in the spec sheets"

The agent will automatically search uploaded documents and provide relevant answers!
