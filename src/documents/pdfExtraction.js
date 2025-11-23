// src/documents/pdfExtraction.js

// Default model used for PDF text extraction if env.OPENAI_MODEL is not set.
// This should be a Responses-capable model (4.1 / 4o / mini variant).
const FALLBACK_MODEL = 'gpt-4.1-mini';

/**
 * Extract readable plain text from a PDF using OpenAI Files + Responses APIs.
 *
 * Steps:
 *   1. Upload the PDF to the Files API with purpose "assistants".
 *   2. Call the Responses API with an input_text + input_file, asking it to
 *      output ALL text as plain UTF-8 (no summary, no markdown).
 *
 * @param {any} env       Cloudflare Worker env (must contain OPENAI_API_KEY)
 * @param {File|Blob} file   The uploaded PDF file (from formData.get('file'))
 * @param {string} filename   Original filename (for logging only)
 * @returns {Promise<string>} Extracted plain text
 */
export async function extractTextFromPdfWithOpenAI(env, file, filename) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  // 1️⃣ Upload the PDF to OpenAI Files API
  const uploadForm = new FormData();
  uploadForm.append('file', file, filename);
  // "assistants" is a supported purpose for files used with models/tools.
  uploadForm.append('purpose', 'assistants');

  const uploadRes = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      // Important: let FormData set Content-Type with the boundary.
      Authorization: `Bearer ${apiKey}`,
    },
    body: uploadForm,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`OpenAI file upload failed: ${uploadRes.status} ${text}`);
  }

  const uploadJson = await uploadRes.json();
  const fileId = uploadJson.id;
  if (!fileId) {
    throw new Error('OpenAI file upload did not return a file id');
  }

  // 2️⃣ Ask the Responses API to extract full plain text from that file
  const model = env.OPENAI_MODEL || FALLBACK_MODEL;

  const responseRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                'You are a PDF text extractor. ' +
                'Extract ALL readable text from this PDF in logical reading order. ' +
                'Include headings, labels and table contents (as text). ' +
                'Output PLAIN UTF-8 text only, no explanations, no markdown.',
            },
            {
              type: 'input_file',
              file_id: fileId,
            },
          ],
        },
      ],
    }),
  });

  if (!responseRes.ok) {
    const text = await responseRes.text();
    throw new Error(
      `OpenAI PDF extraction failed: ${responseRes.status} ${text}`,
    );
  }

  const respJson = await responseRes.json();

  // 3️⃣ Pull out the extracted text from the Responses payload
  let extracted = '';

  if (typeof respJson.output_text === 'string') {
    extracted = respJson.output_text;
  } else if (Array.isArray(respJson.output) && respJson.output.length > 0) {
    const first = respJson.output[0];
    if (first && Array.isArray(first.content)) {
      extracted = first.content
        .map((c) => (typeof c.text === 'string' ? c.text : ''))
        .join('\n')
        .trim();
    }
  } else if (respJson.choices?.[0]?.message?.content) {
    const content = respJson.choices[0].message.content;
    if (Array.isArray(content)) {
      extracted = content
        .map((part) =>
          typeof part.text === 'string'
            ? part.text
            : part.type === 'output_text'
            ? part.text
            : '',
        )
        .join('\n')
        .trim();
    } else if (typeof content === 'string') {
      extracted = content.trim();
    }
  }

  if (!extracted || !extracted.trim()) {
    throw new Error('OpenAI PDF extraction returned no text');
  }

  return extracted;
}

