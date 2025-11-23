export async function extractTextFromPdfWithOpenAI(env, file, filename) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const formData = new FormData();
  formData.append('file', file, filename);
  formData.append('purpose', 'file-extract');

  const uploadResponse = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!uploadResponse.ok) {
    const message = await uploadResponse.text();
    throw new Error(`OpenAI file upload failed: ${uploadResponse.status} ${message}`);
  }

  const uploadJson = await uploadResponse.json();
  const fileId = uploadJson.id;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: "Extract the full plain text from this PDF, in reading order. Return just the text content with page breaks as '\\n---PAGE BREAK---\\n' between pages. Do not summarise, do not omit details."
            },
            {
              type: 'input_file',
              file_id: fileId
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI PDF extraction failed: ${response.status} ${message}`);
  }

  const json = await response.json();
  const answer =
    json.output_text ||
    json.choices?.[0]?.message?.content?.[0]?.text ||
    json.choices?.[0]?.message?.content ||
    '';

  if (!answer || typeof answer !== 'string') {
    throw new Error('OpenAI PDF extraction returned no text');
  }

  return answer;
}
