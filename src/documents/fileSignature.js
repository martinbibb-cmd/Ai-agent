/**
 * File signature (magic byte) validation utility
 * Validates file types based on their binary signatures rather than extensions or MIME types
 */

/**
 * File signature definitions
 * Each entry contains the byte offset and expected bytes for that file type
 */
const FILE_SIGNATURES = {
  pdf: [
    { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] } // %PDF
  ],
  png: [
    { offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] } // PNG signature
  ],
  jpeg: [
    { offset: 0, bytes: [0xFF, 0xD8, 0xFF, 0xE0] }, // JPEG JFIF
    { offset: 0, bytes: [0xFF, 0xD8, 0xFF, 0xE1] }, // JPEG EXIF
    { offset: 0, bytes: [0xFF, 0xD8, 0xFF, 0xE2] }, // JPEG Canon
    { offset: 0, bytes: [0xFF, 0xD8, 0xFF, 0xDB] }  // JPEG Samsung
  ],
  gif: [
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }  // GIF89a
  ],
  zip: [
    { offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] }, // ZIP
    { offset: 0, bytes: [0x50, 0x4B, 0x05, 0x06] }, // ZIP empty archive
    { offset: 0, bytes: [0x50, 0x4B, 0x07, 0x08] }  // ZIP spanned archive
  ],
  // Office documents are ZIP-based
  docx: [
    { offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] } // DOCX is ZIP
  ],
  xlsx: [
    { offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] } // XLSX is ZIP
  ],
  pptx: [
    { offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] } // PPTX is ZIP
  ],
  // Legacy Office formats
  doc: [
    { offset: 0, bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] } // DOC (OLE2)
  ],
  xls: [
    { offset: 0, bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] } // XLS (OLE2)
  ],
  ppt: [
    { offset: 0, bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] } // PPT (OLE2)
  ]
};

/**
 * MIME type to file signature type mapping
 */
const MIME_TO_SIGNATURE = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'application/zip': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt'
};

/**
 * Check if a buffer matches a specific signature
 * @param {ArrayBuffer|Uint8Array} buffer - The file buffer to check
 * @param {Object} signature - The signature definition
 * @returns {boolean} - True if the buffer matches the signature
 */
function matchesSignature(buffer, signature) {
  const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (uint8Array.length < signature.offset + signature.bytes.length) {
    return false;
  }

  for (let i = 0; i < signature.bytes.length; i++) {
    if (uint8Array[signature.offset + i] !== signature.bytes[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Detect file type from buffer content using magic bytes
 * @param {ArrayBuffer|Uint8Array} buffer - The file buffer to analyze
 * @returns {string|null} - Detected file type or null if unknown
 */
export function detectFileType(buffer) {
  const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Need at least 8 bytes to check most signatures
  if (uint8Array.length < 8) {
    return null;
  }

  // Check each file type's signatures
  for (const [fileType, signatures] of Object.entries(FILE_SIGNATURES)) {
    for (const signature of signatures) {
      if (matchesSignature(uint8Array, signature)) {
        return fileType;
      }
    }
  }

  return null;
}

/**
 * Validate that a file's content matches its declared MIME type
 * @param {ArrayBuffer|Uint8Array} buffer - The file buffer
 * @param {string} declaredMimeType - The MIME type claimed by the client
 * @returns {Object} - Validation result with isValid, detectedType, and message
 */
export function validateFileSignature(buffer, declaredMimeType) {
  const detectedType = detectFileType(buffer);
  const expectedType = MIME_TO_SIGNATURE[declaredMimeType];

  // If we don't have a signature for this MIME type, we can't validate it
  if (!expectedType) {
    return {
      isValid: true, // Allow through if we can't validate
      detectedType,
      declaredType: declaredMimeType,
      message: 'No signature validation available for this MIME type',
      validatable: false
    };
  }

  // If we couldn't detect a type, the file might be corrupted or unknown
  if (!detectedType) {
    return {
      isValid: false,
      detectedType: null,
      declaredType: declaredMimeType,
      message: `Could not detect file signature. File may be corrupted or not a valid ${expectedType}.`,
      validatable: true
    };
  }

  // Check if detected type matches expected type
  // Note: Office documents (docx, xlsx, pptx) all have ZIP signatures,
  // so we need special handling
  const isOfficeDoc = ['docx', 'xlsx', 'pptx'].includes(expectedType);
  const isZipSignature = detectedType === 'zip';

  if (isOfficeDoc && isZipSignature) {
    // Office documents have ZIP signature - this is expected
    return {
      isValid: true,
      detectedType: 'zip',
      declaredType: declaredMimeType,
      message: 'Office document has valid ZIP signature',
      validatable: true
    };
  }

  if (detectedType === expectedType) {
    return {
      isValid: true,
      detectedType,
      declaredType: declaredMimeType,
      message: 'File signature matches declared type',
      validatable: true
    };
  }

  // Mismatch detected
  return {
    isValid: false,
    detectedType,
    declaredType: declaredMimeType,
    message: `File signature mismatch: file appears to be ${detectedType} but declared as ${declaredMimeType}`,
    validatable: true
  };
}

/**
 * Validate PDF file specifically
 * @param {ArrayBuffer|Uint8Array} buffer - The PDF buffer
 * @returns {Object} - Validation result with isValid, version, encrypted, and message
 */
export function validatePDF(buffer) {
  const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Check minimum size
  if (uint8Array.length < 10) {
    return {
      isValid: false,
      message: 'File too small to be a valid PDF',
      encrypted: false
    };
  }

  // Check PDF header
  const header = new TextDecoder('ascii').decode(uint8Array.slice(0, 8));
  if (!header.startsWith('%PDF-')) {
    return {
      isValid: false,
      message: 'Invalid PDF header - file does not start with %PDF-',
      encrypted: false
    };
  }

  // Extract version
  const version = header.substring(5, 8);

  // Check for encryption (simple check - look for /Encrypt in first 4KB)
  const searchLength = Math.min(4096, uint8Array.length);
  const searchText = new TextDecoder('ascii').decode(uint8Array.slice(0, searchLength));
  const encrypted = searchText.includes('/Encrypt');

  // Check for EOF marker (%%EOF should be near the end)
  const endLength = Math.min(1024, uint8Array.length);
  const endText = new TextDecoder('ascii').decode(uint8Array.slice(-endLength));
  const hasEOF = endText.includes('%%EOF');

  if (!hasEOF) {
    return {
      isValid: false,
      version,
      message: 'PDF appears to be corrupted - missing EOF marker',
      encrypted
    };
  }

  return {
    isValid: true,
    version,
    encrypted,
    message: encrypted
      ? `Valid PDF v${version} (encrypted - text extraction may fail)`
      : `Valid PDF v${version}`
  };
}

/**
 * Check if a file type is supported for parsing
 * @param {string} fileType - The detected file type
 * @returns {boolean} - True if the file type is supported
 */
export function isSupportedFileType(fileType) {
  const supportedTypes = ['pdf', 'text'];
  // Text files don't have signatures, so we allow null through
  return fileType === null || supportedTypes.includes(fileType);
}

/**
 * Get human-readable file type name
 * @param {string} fileType - The file type code
 * @returns {string} - Human-readable name
 */
export function getFileTypeName(fileType) {
  const names = {
    pdf: 'PDF Document',
    png: 'PNG Image',
    jpeg: 'JPEG Image',
    gif: 'GIF Image',
    zip: 'ZIP Archive',
    docx: 'Word Document',
    xlsx: 'Excel Spreadsheet',
    pptx: 'PowerPoint Presentation',
    doc: 'Legacy Word Document',
    xls: 'Legacy Excel Spreadsheet',
    ppt: 'Legacy PowerPoint Presentation'
  };

  return names[fileType] || fileType || 'Unknown';
}
