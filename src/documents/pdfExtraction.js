const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

/**
 * Extract plain text from a PDF using OpenAI's file input + Responses API.
 *
 * @param {Env} env - Worker environment with OPENAI_API_KEY and optional OPENAI_MODEL
 * @param {File|Blob} file - The uploaded PDF file from formData.get('file')
 * @param {string} filename - Original filename, e.g. "manual.pdf"
 * @returns {Promise<string>} - Extracted plain text
 */
export async function extractTextFromPdfWithOpenAI(env, file, filename) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  // 1) Upload PDF to OpenAI Files API
  const formData = new FormData();
  formData.append('file', file, filename);
  formData.append('purpose', 'file-extract');

  const uploadRes = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      // IMPORTANT: do NOT set Content-Type manually when sending FormData
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
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

  // 2) Ask OpenAI to extract full plain text from that file
  const model = env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

  const responsesRes = await fetch('https://api.openai.com/v1/responses', {
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
                'Extract the full plain text from this PDF in logical reading order. ' +
                "Use '\\n---PAGE BREAK---\\n' between pages. Do not summarise or omit details.",
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

  if (!responsesRes.ok) {
    const text = await responsesRes.text();
    throw new Error(`OpenAI PDF extraction failed: ${responsesRes.status} ${text}`);
  }

  const responsesJson = await responsesRes.json();

  // Pull text out of the Responses API shape.
  // Adjust if needed to match the actual response shape, but this fits current docs:
  let extracted = '';

  if (typeof responsesJson.output_text === 'string') {
    extracted = responsesJson.output_text;
  } else if (Array.isArray(responsesJson.output) && responsesJson.output.length > 0) {
    const first = responsesJson.output[0];
    if (typeof first === 'string') {
      extracted = first;
    } else if (first.text) {
      extracted = first.text;
    }
  } else if (responsesJson.choices?.[0]?.message?.content) {
    const content = responsesJson.choices[0].message.content;
    if (Array.isArray(content)) {
      extracted = content.map(part => part.text || '').join('\n');
    } else if (typeof content === 'string') {
      extracted = content;
    }
  }

  if (!extracted || typeof extracted !== 'string') {
    throw new Error('OpenAI PDF extraction returned no text');
  }

  return extracted;
}
