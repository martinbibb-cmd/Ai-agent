# Creating JSON Documents for Upload

## Why JSON?

JSON documents offer several advantages:
- **Pre-structured data**: Already organized and queryable
- **No parsing errors**: JSON is validated on creation
- **Rich metadata**: Include all metadata upfront
- **Easy to generate**: Create programmatically from databases, APIs, etc.

## JSON Document Format

You can create JSON files in two ways:

### Option 1: Simple Text Document

```json
{
  "title": "Boiler Installation Guide",
  "author": "Technical Team",
  "created": "2024-01-20",
  "category": "manuals",
  "tags": ["boiler", "installation", "heating"],
  "content": "This is the main content of the document. You can include paragraphs, lists, and structured information here."
}
```

### Option 2: Structured Multi-Page Document

```json
{
  "title": "Worcester Bosch Greenstar 8000 Manual",
  "author": "Worcester Bosch",
  "language": "en",
  "category": "manuals",
  "tags": ["worcester-bosch", "greenstar", "8000", "manual"],
  "pages": [
    {
      "pageNumber": 1,
      "title": "Introduction",
      "content": "The Greenstar 8000 is a high-efficiency condensing boiler designed for UK homes. It offers outputs from 25kW to 50kW and achieves A-rated efficiency."
    },
    {
      "pageNumber": 2,
      "title": "Technical Specifications",
      "content": "Output Range: 25kW - 50kW\nEfficiency: 94% (A-rated)\nFuel Type: Natural Gas\nDimensions: 440mm (W) x 880mm (H) x 460mm (D)\nWeight: 45kg"
    },
    {
      "pageNumber": 3,
      "title": "Installation Requirements",
      "content": "1. Suitable for properties up to 150m²\n2. Requires 15mm gas supply\n3. Must be installed by Gas Safe registered engineer\n4. Minimum 600mm clearance required"
    }
  ]
}
```

### Option 3: Database Export Format

Perfect for exporting from databases:

```json
{
  "metadata": {
    "title": "Customer Survey Results Q1 2024",
    "created": "2024-03-31T10:00:00Z",
    "author": "Survey System",
    "category": "surveys",
    "tags": ["surveys", "q1-2024", "customer-feedback"]
  },
  "data": [
    {
      "id": 1,
      "question": "How satisfied are you with your boiler?",
      "responses": {
        "very_satisfied": 45,
        "satisfied": 32,
        "neutral": 15,
        "dissatisfied": 8
      }
    },
    {
      "id": 2,
      "question": "Would you recommend our service?",
      "responses": {
        "yes": 78,
        "no": 12,
        "maybe": 10
      }
    }
  ]
}
```

## How the Parser Handles JSON

When you upload a JSON file, the enhanced parser (v2.0):

1. **Validates JSON syntax**
2. **Detects structure**:
   - Array: Each item becomes a "page"
   - Object: Each top-level key becomes a "page"
3. **Extracts metadata** if present
4. **Creates searchable text** from all content
5. **Generates chunks** for semantic search

## Example: Converting PDF Data to JSON

If you have extracted data from a PDF, structure it like this:

```json
{
  "title": "Vaillant ecoTEC Plus Manual",
  "metadata": {
    "author": "Vaillant",
    "pdfVersion": "1.7",
    "created": "2023-05-15",
    "pageCount": 24
  },
  "pages": [
    {
      "pageNumber": 1,
      "headers": ["Safety Information"],
      "content": "IMPORTANT SAFETY WARNINGS\n\n1. This boiler must only be installed by a Gas Safe registered engineer.\n2. Read all instructions before installation.\n3. Keep this manual for future reference."
    },
    {
      "pageNumber": 2,
      "headers": ["Overview", "Key Features"],
      "content": "The ecoTEC Plus range offers:\n- High efficiency (up to 94%)\n- Compact design\n- Easy installation\n- Quiet operation"
    }
  ]
}
```

## Creating JSON from Existing Documents

### Python Example

```python
import json

# Convert text file to JSON
with open('manual.txt', 'r') as f:
    content = f.read()

document = {
    "title": "Boiler Manual",
    "category": "manuals",
    "tags": ["boiler", "heating"],
    "content": content
}

with open('manual.json', 'w') as f:
    json.dump(document, f, indent=2)
```

### JavaScript Example

```javascript
// Convert structured data to JSON
const document = {
  title: "Installation Guide",
  category: "guides",
  tags: ["installation", "setup"],
  pages: [
    {
      pageNumber: 1,
      title: "Step 1: Preparation",
      content: "Gather all required tools..."
    },
    {
      pageNumber: 2,
      title: "Step 2: Installation",
      content: "Begin by mounting the unit..."
    }
  ]
};

// Save to file
const fs = require('fs');
fs.writeFileSync('guide.json', JSON.stringify(document, null, 2));
```

### Spreadsheet to JSON

If you have data in Excel/Google Sheets:

```python
import pandas as pd
import json

# Read Excel file
df = pd.read_excel('boiler_specs.xlsx')

# Convert to JSON
documents = []
for _, row in df.iterrows():
    doc = {
        "title": row['Model'],
        "category": "specifications",
        "tags": ["boiler", "specs", row['Manufacturer']],
        "content": f"""
Model: {row['Model']}
Manufacturer: {row['Manufacturer']}
Output: {row['Output_kW']}kW
Efficiency: {row['Efficiency']}%
Price: £{row['Price']}
        """.strip()
    }
    documents.append(doc)

with open('boiler_database.json', 'w') as f:
    json.dump(documents, f, indent=2)
```

## Uploading JSON Documents

### Via UI
1. Go to http://localhost:8787/documents.html
2. Click "Drop file here or click to browse"
3. Select your `.json` file
4. Choose category and add tags
5. Click "Upload"

### Via API
```bash
curl -X POST http://localhost:8787/documents/upload \
  -F "file=@document.json" \
  -F "category=manuals" \
  -F "tags=[\"boiler\",\"heating\"]"
```

### Process the Document
```bash
# After upload, process to extract structure
curl -X POST http://localhost:8787/documents/{documentId}/process
```

### Get as JSON
```bash
# Export the parsed document
curl http://localhost:8787/documents/{documentId}/json > output.json
```

## Benefits of JSON Upload

1. **No OCR needed**: Text is already structured
2. **Preserves structure**: Maintain sections, pages, metadata
3. **Faster processing**: No PDF parsing required
4. **Consistent format**: Same structure every time
5. **Easy validation**: Check format before upload

## Validation

Validate your JSON before uploading:

```bash
# Using jq
jq . document.json

# Or Python
python -m json.tool document.json
```

## Tips

1. **Keep it readable**: Use proper indentation
2. **Include metadata**: Add title, author, dates
3. **Structure pages**: Break long content into pages
4. **Add headers**: Help with section identification
5. **Use tags**: Make documents searchable
6. **Validate first**: Check JSON syntax before upload

## Common Issues

**Issue**: JSON upload fails
**Solution**: Validate JSON syntax using online validator or `jq`

**Issue**: Content not searchable
**Solution**: Ensure content is in a `content` or `pages` field

**Issue**: Metadata not extracted
**Solution**: Use standard field names: `title`, `author`, `created`

## Next Steps

After uploading JSON:
1. **Process**: Call `/process` endpoint to extract text
2. **Search**: Use full-text search to find content
3. **Export**: Get enhanced JSON with word counts, structure analysis
4. **Query**: Use the parsed structure for reports and analysis
