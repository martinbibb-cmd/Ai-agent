// src/documents/search.js

const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

const STOP_WORDS = new Set([
  'what', 'is', 'the', 'for', 'and', 'or', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'from',
  'does', 'do', 'be', 'are', 'am', 'i', 'you', 'we', 'they', 'it', 'this', 'that', 'these', 'those',
  'tell', 'me', 'about', 'please', 'maximum', 'minimum', 'length'
]);

function extractKeywords(question, maxKeywords = 5) {
  const lower = question.toLowerCase();
  const cleaned = lower.replace(/[^a-z0-9\s]/g, ' ');
  const parts = cleaned.split(/\s+/).filter(Boolean);

  const keywords = [];
  for (const word of parts) {
    if (STOP_WORDS.has(word)) continue;
    if (word.length < 3) continue;
    if (!keywords.includes(word)) {
      keywords.push(word);
    }
  }

  if (keywords.length === 0) return [cleaned.trim()].filter(Boolean);
  return keywords.slice(0, maxKeywords);
}

async function embedText(env, input) {
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_EMBEDDING_MODEL || DEFAULT_OPENAI_EMBEDDING_MODEL;

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI embeddings error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const embedding = data.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error('No embedding returned');
  }

  return embedding;
}

export async function upsertVectorsForDocument(env, documentId, filename, category) {
  if (!env.DOC_INDEX) return;

  const { results } = await env.DB.prepare(
    'SELECT chunk_text, page_number, chunk_index FROM document_chunks WHERE document_id = ?1'
  ).bind(documentId).all();

  const chunks = results || [];
  const vectors = [];

  for (const row of chunks) {
    const text = row.chunk_text;
    if (!text || !text.trim()) {
      continue;
    }

    const embedding = await embedText(env, text);
    const id = `${documentId}::${row.chunk_index}`;

    vectors.push({
      id,
      values: embedding,
      metadata: {
        documentId,
        filename,
        category,
        pageNumber: row.page_number,
        chunkIndex: row.chunk_index,
      },
    });
  }

  if (vectors.length && env.DOC_INDEX) {
    await env.DOC_INDEX.upsert(vectors);
  }
}

async function fetchChunkText(env, documentId, chunkIndex) {
  const row = await env.DB.prepare(
    'SELECT chunk_text, page_number FROM document_chunks WHERE document_id = ?1 AND chunk_index = ?2'
  ).bind(documentId, chunkIndex).first();

  return {
    text: row?.chunk_text || '',
    pageNumber: row?.page_number ?? null,
  };
}

export async function searchChunksSimple(env, question, limit = 8) {
  const db = env.DB;
  const keywords = extractKeywords(question, 5);

  if (!keywords.length) return [];

  const conditions = [];
  const bindValues = [];

  keywords.forEach((kw, i) => {
    const idx = i + 1;
    conditions.push(`INSTR(LOWER(dc.chunk_text), ?${idx}) > 0`);
    bindValues.push(kw);
  });

  const whereClause = conditions.join(' OR ');
  const limitParamIndex = keywords.length + 1;

  const sql = `
    SELECT
      dc.chunk_text,
      dc.document_id,
      dc.page_number,
      dc.chunk_index,
      d.filename,
      d.category
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE ${whereClause}
    LIMIT ?${limitParamIndex};
  `;

  bindValues.push(limit);

  const { results } = await db.prepare(sql).bind(...bindValues).all();

  return (results || []).map((row) => ({
    text: row.chunk_text,
    documentId: row.document_id,
    pageNumber: row.page_number,
    chunkIndex: row.chunk_index,
    filename: row.filename ?? null,
    category: row.category ?? null,
  }));
}

export async function searchChunksVector(env, query, topK = 8) {
  if (!env.DOC_INDEX) return [];

  const embedding = await embedText(env, query);
  const result = await env.DOC_INDEX.query({
    vector: embedding,
    topK,
    returnValues: false,
    returnMetadata: true,
  });

  const matches = result.matches || [];
  const chunks = [];

  for (const match of matches) {
    const metadata = match.metadata || {};
    const documentId = metadata.documentId || '';
    const chunkIndex = metadata.chunkIndex ?? 0;
    const pageNumberFromMetadata = metadata.pageNumber ?? null;

    let text = metadata.chunk_text || '';
    let pageNumber = pageNumberFromMetadata;

    if (!text && documentId) {
      const fetched = await fetchChunkText(env, documentId, chunkIndex);
      text = fetched.text;
      pageNumber = pageNumber ?? fetched.pageNumber;
    }

    if (!text) {
      continue;
    }

    chunks.push({
      text,
      documentId,
      pageNumber,
      chunkIndex,
      filename: metadata.filename ?? null,
      category: metadata.category ?? null,
    });
  }

  return chunks;
}
