-- Migration: Add parsed_metadata and parsed_structure columns
-- These columns store error details and enhanced parsing metadata

-- Add parsed_metadata column if it doesn't exist
-- This stores JSON metadata from the parser including error details
ALTER TABLE documents ADD COLUMN parsed_metadata TEXT;

-- Add parsed_structure column if it doesn't exist
-- This stores JSON structure information from the parser
ALTER TABLE documents ADD COLUMN parsed_structure TEXT;

-- Add parser_version column if it doesn't exist
-- Tracks which version of the parser was used
ALTER TABLE documents ADD COLUMN parser_version TEXT;

-- Add parse_timestamp column if it doesn't exist
-- Timestamp when the document was last parsed
ALTER TABLE documents ADD COLUMN parse_timestamp TEXT;

-- Add word_count column if it doesn't exist
-- Total word count from parsed content
ALTER TABLE documents ADD COLUMN word_count INTEGER;

-- Add character_count column if it doesn't exist
-- Total character count from parsed content
ALTER TABLE documents ADD COLUMN character_count INTEGER;

-- Add format column if it doesn't exist
-- Document format (pdf, text, etc.)
ALTER TABLE documents ADD COLUMN format TEXT;

-- Add language column if it doesn't exist
-- Detected language of the document
ALTER TABLE documents ADD COLUMN language TEXT;
