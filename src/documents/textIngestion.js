import { DocumentManager } from './manager.js';

function buildTagsArray(rawTags) {
  if (rawTags === undefined) return [];
  if (!Array.isArray(rawTags)) {
    const error = new Error('tags must be an array of strings');
    error.statusCode = 400;
    throw error;
  }
  return rawTags.map((tag) => tag?.toString()).filter(Boolean);
}

export function buildTextIngestionOptions(body = {}) {
  const text = (body?.text || '').toString();
  if (!text.trim()) {
    const error = new Error("'text' is required and cannot be empty");
    error.statusCode = 400;
    throw error;
  }

  let filename = (body?.filename || '').toString().trim();
  if (!filename) {
    filename = `text-upload-${Date.now()}.txt`;
  }

  const category = (body?.category || 'general').toString();
  const tags = buildTagsArray(body?.tags);
  const contentType = (body?.contentType || 'text/plain').toString();

  return {
    filename,
    originalFilename: body?.originalFilename || filename,
    contentType,
    uploadedBy: body?.uploadedBy || 'user',
    category,
    tags,
    text,
  };
}

export async function ingestDocumentText(documentManager, body = {}) {
  const options = buildTextIngestionOptions(body);
  return documentManager.ingestTextDocument(options);
}

export async function ingestDocumentTextWithEnv(env, body = {}) {
  const manager = new DocumentManager(env.DOCUMENTS, env.DB);
  return ingestDocumentText(manager, body);
}
