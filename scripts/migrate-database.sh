#!/bin/bash

# Database Migration Script for Cloudflare D1
# Adds missing columns to the documents table

echo "Starting database migration..."
echo ""

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo "Error: wrangler CLI not found. Please install it first."
    exit 1
fi

# Database details from wrangler.toml
DB_NAME="agent-db"
DB_ID="0bef3501-1915-4566-8fa9-2f63f1d3bd84"

echo "Target database: $DB_NAME (ID: $DB_ID)"
echo ""

# Function to check if a column exists
check_column() {
    local column_name=$1
    echo "Checking if column '$column_name' exists..."

    # This will succeed if column exists, fail if not
    wrangler d1 execute $DB_NAME --remote --command "SELECT $column_name FROM documents LIMIT 1" &> /dev/null
    return $?
}

# Function to add a column
add_column() {
    local column_name=$1
    local column_type=$2

    if check_column "$column_name"; then
        echo "✓ Column '$column_name' already exists, skipping"
    else
        echo "→ Adding column '$column_name' ($column_type)..."
        wrangler d1 execute $DB_NAME --remote --command "ALTER TABLE documents ADD COLUMN $column_name $column_type"

        if [ $? -eq 0 ]; then
            echo "✓ Column '$column_name' added successfully"
        else
            echo "✗ Failed to add column '$column_name'"
            return 1
        fi
    fi
    echo ""
}

# Add all missing columns
echo "=== Adding Missing Columns ==="
echo ""

add_column "parsed_metadata" "TEXT"
add_column "parsed_structure" "TEXT"
add_column "parser_version" "TEXT"
add_column "parse_timestamp" "TEXT"
add_column "word_count" "INTEGER"
add_column "character_count" "INTEGER"
add_column "format" "TEXT"
add_column "language" "TEXT"

echo "=== Migration Complete ==="
echo ""
echo "Verifying schema..."
wrangler d1 execute $DB_NAME --remote --command "PRAGMA table_info(documents)"

echo ""
echo "Migration completed successfully!"
echo "You can now deploy your updated worker."
