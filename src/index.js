import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools/definitions.js';
import { toolHandlers } from './tools/handlers.js';
import { DocumentManager } from './documents/manager.js';
import { ingestDocumentText, ingestRawTextAsDocument } from './documents/textIngestion.js';
import { extractTextFromPdfWithOpenAI } from './documents/pdfExtraction.js';
import { upsertVectorsForDocument, searchChunksSimple, searchChunksVector } from './documents/search.js';

// Default TTS voice
const DEFAULT_TTS_VOICE = 'shimmer';

// Core system prompt
const CORE_SYSTEM_PROMPT = `You are an advanced AI assistant specialized in helping with surveys and boiler/heating system inquiries for UK homes.

YOUR CAPABILITIES:

**Survey Management:**
- Create structured surveys with various question types (multiple choice, ratings, text, yes/no)
- Guide users through survey completion
- Save and track survey responses
- Help analyze survey data

**Document Knowledge:**
- Search uploaded documents (manuals, spec sheets, guides) for specific information
- Answer questions based on uploaded PDF documents
- Reference specific pages and sections from documents
- List available documents and their contents

**Image Analysis:**
- Analyze images of boilers, heating systems, error codes, or installation setups
- Identify boiler models and components from photos
- Review installation diagrams and schematics
- Examine error displays and diagnostic screens

**Boiler & Heating Expertise (UK-focused):**
- Recommend appropriate boilers based on home size, fuel type, and requirements
- Calculate heating needs (kW requirements) for UK homes
- Diagnose common boiler issues and suggest solutions
- Compare different boiler models and manufacturers
- Estimate installation costs in GBP
- Explain different boiler types (combi, system, conventional)
- Advise on energy efficiency and fuel types

**Key Knowledge Areas:**
- Boiler types: Combi, System, Conventional/Regular
- Fuel types: Gas, Oil, LPG, Electric
- Brands: Worcester Bosch, Vaillant, Ideal, Baxi, Grant, Firebird, etc.
- Energy efficiency ratings and modern condensing technology
- Installation requirements and costs (UK)
- Maintenance and troubleshooting
- UK Building Regulations compliance

**Units (UK Metric Standard):**
- Home size: square metres (m²)
- Boiler output: kilowatts (kW)
- Dimensions: millimetres (mm)
- Temperature: Celsius (°C)
- Currency: GBP (£)

IMPORTANT INSTRUCTIONS:
1. Use the available tools to provide accurate, data-driven recommendations
2. Always ask clarifying questions when you need more information
3. Explain technical concepts clearly and concisely
4. When recommending boilers, consider home size (in m²), budget, and efficiency needs
5. For troubleshooting, assess safety first - always recommend Gas Safe registered engineer for gas/safety issues
6. Be thorough but conversational
7. Use UK metric units in all calculations and recommendations
8. When users send images, analyze them carefully and provide detailed observations

You have access to specialized tools - use them when appropriate to provide the best assistance.`;

const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

async function callOpenAI(env, messages) {
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Enable CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Try to serve static assets first (for non-API routes)
    if (!url.pathname.startsWith('/agent') &&
        !url.pathname.startsWith('/data/') &&
        !url.pathname.startsWith('/voices') &&
        !url.pathname.startsWith('/tools') &&
        !url.pathname.startsWith('/health') &&
        !url.pathname.startsWith('/api') &&
        !url.pathname.startsWith('/documents') &&
        url.pathname !== '/ask') {

      if (env.ASSETS) {
        try {
          return await env.ASSETS.fetch(request);
        } catch (e) {
          console.error('Assets fetch error:', e);
        }
      }
    }

    // Initialize Document Manager if R2 and D1 are available
    const documentManager = (env.DOCUMENTS && env.DB)
      ? new DocumentManager(env.DOCUMENTS, env.DB)
      : null;

    // Personas removed - endpoint no longer available

    // Direct text ingestion endpoint
    if (url.pathname === '/documents/text' && request.method === 'POST') {
      if (!documentManager) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Document storage not configured'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const body = await request.json();
        const result = await ingestDocumentText(documentManager, body);

        try {
          await upsertVectorsForDocument(env, result.id, result.filename, result.category ?? null);
        } catch (vectorError) {
          console.error('Vector upsert error (ignored):', vectorError);
        }

        return new Response(JSON.stringify({
          ok: true,
          documentId: result.id,
          chunksInserted: result.chunksInserted || 0,
          filename: result.filename,
          category: result.category ?? null,
          tags: result.tags ?? []
        }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Text ingestion error:', error);
        return new Response(JSON.stringify({
          ok: false,
          error: error.message
        }), {
          status: error.statusCode || 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Upload document endpoint
    if (url.pathname === '/api/documents/upload' && request.method === 'POST') {
      if (!documentManager) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Document storage not configured'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const MAX_UPLOAD_SIZE_BYTES = 24 * 1024 * 1024; // 24 MB
        const formData = await request.formData();
        const category = formData.get('category') || 'general';

        // Parse tags with error handling
        let tags = [];
        const tagsParam = formData.get('tags');
        if (tagsParam) {
          try {
            tags = JSON.parse(tagsParam);
            if (!Array.isArray(tags)) {
              return new Response(JSON.stringify({
                ok: false,
                error: 'Invalid tags format',
                details: 'Tags must be a JSON array'
              }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          } catch (parseError) {
            return new Response(JSON.stringify({
              ok: false,
              error: 'Invalid tags JSON',
              details: parseError.message
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        const files = formData.getAll('files').filter(Boolean);
        const singleFile = formData.get('file');
        if (singleFile) {
          files.push(singleFile);
        }

        if (files.length === 0) {
          return new Response(JSON.stringify({
            ok: false,
            error: 'No file provided'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const oversizedFile = files.find(file => file.size > MAX_UPLOAD_SIZE_BYTES);
        if (oversizedFile) {
          return new Response(JSON.stringify({
            ok: false,
            error: `File too large (max ${Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB)`,
            details: `${oversizedFile.name || 'File'} exceeds the maximum upload size`
          }), {
            status: 413,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const results = [];

        for (const file of files) {
          try {
            const contentType = file.type || 'application/octet-stream';
            const filename = file.name || `upload-${Date.now()}`;
            const textContent = contentType === 'application/pdf'
              ? await extractTextFromPdfWithOpenAI(env, file, filename)
              : await file.text();

            const parsedResult = await ingestRawTextAsDocument(
              env,
              {
                filename,
                originalFilename: filename,
                contentType,
                category,
                tags,
                uploadedBy: 'user',
                text: textContent
              },
              documentManager
            );

            try {
              await upsertVectorsForDocument(env, parsedResult.id, parsedResult.filename, parsedResult.category ?? null);
            } catch (vectorError) {
              console.error('Vector upsert error (ignored):', vectorError);
            }

            results.push({
              ok: true,
              document: parsedResult,
              documentId: parsedResult.id,
              filename: parsedResult.filename,
              chunksInserted: parsedResult.chunksInserted
            });
          } catch (fileError) {
            console.error('Upload error for file:', file?.name || 'unknown', fileError);
            results.push({
              ok: false,
              error: fileError?.message || 'Upload failed',
              filename: file?.name || 'unknown'
            });
          }
        }

        const allOk = results.every(r => r.ok);
        const status = allOk ? 200 : 207; // 207 = multi-status when some files fail

        return new Response(JSON.stringify({
          ok: allOk,
          results,
          uploadedCount: results.filter(r => r.ok).length,
          failedCount: results.filter(r => !r.ok).length
        }), {
          status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        console.error('Upload error:', error);
        return new Response(JSON.stringify({
          ok: false,
          error: error?.message || 'Upload failed',
          details: error?.stack || String(error)
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // List documents endpoint
    if (url.pathname === '/api/documents' && request.method === 'GET') {
      if (!documentManager) {
        return new Response(JSON.stringify({ documents: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const category = url.searchParams.get('category');
        const limit = parseInt(url.searchParams.get('limit') || '50');

        const documents = await documentManager.listDocuments({ category, limit });

        return new Response(JSON.stringify({
          documents,
          count: documents.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        console.error('List error:', error);
        return new Response(JSON.stringify({
          error: 'Failed to list documents',
          details: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Get document as structured JSON (enhanced v2.0 format)
    if (url.pathname.match(/^\/api\/documents\/[^\/]+\/json$/) && request.method === 'GET') {
      if (!documentManager) {
        return new Response(JSON.stringify({
          error: 'Document storage not configured'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const documentId = url.pathname.split('/')[3];
        const document = await documentManager.getDocumentJSON(documentId);

        return new Response(JSON.stringify(document), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${document.metadata.title || 'document'}.json"`
          },
        });

      } catch (error) {
        console.error('Get JSON error:', error);
        return new Response(JSON.stringify({
          error: 'Failed to get document',
          details: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Process document endpoint (extract text from uploaded PDF)
    if (url.pathname.match(/^\/api\/documents\/[^\/]+\/process$/) && request.method === 'POST') {
      if (!documentManager) {
        return new Response(JSON.stringify({
          error: 'Document storage not configured'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const documentId = url.pathname.split('/')[3];
        const result = await documentManager.processDocument(documentId);

        return new Response(JSON.stringify({
          success: true,
          document: result
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        console.error('Process error:', error);
        return new Response(JSON.stringify({
          error: 'Failed to process document',
          details: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Delete document endpoint - must match /api/documents/{id} exactly
    if (url.pathname.match(/^\/api\/documents\/[^\/]+$/) && request.method === 'DELETE') {
      if (!documentManager) {
        return new Response(JSON.stringify({
          error: 'Document storage not configured'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const documentId = url.pathname.split('/')[3];

        if (!documentId) {
          return new Response(JSON.stringify({
            error: 'Document ID is required'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log(`Attempting to delete document: ${documentId}`);
        await documentManager.deleteDocument(documentId);

        return new Response(JSON.stringify({
          success: true,
          message: 'Document deleted successfully',
          documentId: documentId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        console.error('Delete error:', error);
        return new Response(JSON.stringify({
          error: 'Failed to delete document',
          details: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // FTS health check endpoint
    if (url.pathname === '/api/documents/fts/health' && request.method === 'GET') {
      if (!documentManager) {
        return new Response(JSON.stringify({
          exists: false,
          healthy: false,
          error: 'Document storage not configured'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const health = await documentManager.checkFTSHealth();
        return new Response(JSON.stringify(health), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('FTS health check error:', error);
        return new Response(JSON.stringify({
          exists: false,
          healthy: false,
          error: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // FTS migration endpoint
    if (url.pathname === '/api/documents/fts/migrate' && request.method === 'POST') {
      if (!documentManager) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Document storage not configured'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const result = await documentManager.rebuildFTSIndex();
        return new Response(JSON.stringify({
          success: true,
          ...result
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('FTS migration error:', error);
        return new Response(JSON.stringify({
          success: false,
          error: `FTS migration failed: ${error.message}`
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Question answering endpoint using document chunks
    if (url.pathname === '/ask' && request.method === 'POST') {
      try {
        const body = await request.json();
        const question = (body?.question || '').toString().trim();

        if (!question) {
          return new Response(JSON.stringify({ error: "Missing 'question'" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!env.OPENAI_API_KEY) {
          return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        let chunks = [];

        try {
          if (env.DOC_INDEX) {
            chunks = await searchChunksVector(env, question, 8);
          }

          if (!chunks || chunks.length === 0) {
            chunks = await searchChunksSimple(env, question, 8);
          }
        } catch (searchError) {
          console.error('Search failed in /ask, falling back to keyword search only', searchError);
          chunks = await searchChunksSimple(env, question, 8);
        }

        let context = '';
        if (chunks.length === 0) {
          context = '[no relevant excerpts found]';
        } else {
          for (const c of chunks) {
            const docLabel = c.filename || c.documentId;
            const pageLabel = c.pageNumber ?? '?';
            context += `[Document: ${docLabel}, page ${pageLabel}]\n`;
            context += `${c.text}\n\n`;
          }
        }

        const messages = [
          {
            role: 'system',
            content:
              'You are a precise technical assistant answering questions from uploaded manuals and guides. ' +
              "Use ONLY the provided document excerpts. If the answer is not clearly contained in them, say you don't know.",
          },
          {
            role: 'system',
            content: `Relevant document excerpts:\n\n${context || '[no relevant excerpts found]'}`,
          },
          {
            role: 'user',
            content: question,
          },
        ];

        const answer = await callOpenAI(env, messages);

        return new Response(
          JSON.stringify({
            answer,
            chunksUsed: chunks,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      } catch (error) {
        console.error('Ask endpoint error:', error);
        return new Response(
          JSON.stringify({
            error: 'Failed to answer question',
            details: error.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
    }

    // Agent endpoint with tool calling and streaming
    if (url.pathname === '/agent' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { message, images = [], conversationHistory = [] } = body;

        // Validate required fields
        if (!message || (typeof message !== 'string' && !Array.isArray(message))) {
          return new Response(JSON.stringify({
            error: 'Missing required field: message is required'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Initialize Anthropic client
        const anthropic = new Anthropic({
          apiKey: env.ANTHROPIC_API_KEY,
        });

        // Use core system prompt WITH PROMPT CACHING
        // Using cache_control to cache the large system prompt reduces latency significantly
        const systemPromptBlocks = [
          {
            type: 'text',
            text: CORE_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }
          }
        ];

        // Build message content - support text + images
        let messageContent;
        if (images && images.length > 0) {
          // Multi-modal message with images
          messageContent = [];

          // Add images first
          images.forEach(img => {
            messageContent.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: img.media_type || 'image/jpeg',
                data: img.data,
              }
            });
          });

          // Add text
          messageContent.push({
            type: 'text',
            text: message
          });
        } else {
          // Text-only message
          messageContent = message;
        }

        // Build messages array from conversation history
        let messages = [
          ...conversationHistory,
          {
            role: 'user',
            content: messageContent,
          },
        ];

        // Create a streaming response
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        // Start async processing
        (async () => {
          try {
            let toolResults = [];
            const maxIterations = 10;
            let iteration = 0;
            let finalResponse = null;

            while (iteration < maxIterations) {
              iteration++;

              // Use streaming API
              const stream = await anthropic.messages.stream({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 4096,
                system: systemPromptBlocks,
                messages: messages,
                tools: tools,
              });

              let currentToolUses = [];
              let textContent = '';
              let stopReason = null;

              // Process stream events
              for await (const event of stream) {
                if (event.type === 'content_block_start') {
                  if (event.content_block?.type === 'tool_use') {
                    currentToolUses.push({
                      id: event.content_block.id,
                      name: event.content_block.name,
                      input: {}
                    });
                  }
                } else if (event.type === 'content_block_delta') {
                  if (event.delta?.type === 'text_delta') {
                    // Stream text tokens to client
                    const text = event.delta.text;
                    textContent += text;
                    await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`));
                  } else if (event.delta?.type === 'input_json_delta') {
                    // Accumulate tool input
                    const lastTool = currentToolUses[currentToolUses.length - 1];
                    if (lastTool) {
                      lastTool.inputChunk = (lastTool.inputChunk || '') + event.delta.partial_json;
                    }
                  }
                } else if (event.type === 'message_delta') {
                  stopReason = event.delta?.stop_reason;
                } else if (event.type === 'message_stop') {
                  finalResponse = await stream.finalMessage();
                }
              }

              // Parse accumulated tool inputs
              currentToolUses.forEach(tool => {
                if (tool.inputChunk) {
                  try {
                    tool.input = JSON.parse(tool.inputChunk);
                  } catch (e) {
                    console.error('Failed to parse tool input:', e);
                    tool.input = {};
                  }
                }
              });

              // Check if we need to handle tool calls
              if (stopReason === 'tool_use' && currentToolUses.length > 0) {
                // Notify client that tools are being executed
                await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'tool_execution', tools: currentToolUses.map(t => t.name) })}\n\n`));

                // Execute tools
                const toolResultsForThisTurn = await Promise.all(
                  currentToolUses.map(async (toolUse) => {
                    try {
                      const handler = toolHandlers[toolUse.name];
                      if (!handler) {
                        return {
                          type: 'tool_result',
                          tool_use_id: toolUse.id,
                          content: JSON.stringify({ error: `Tool ${toolUse.name} not found` })
                        };
                      }

                      const result = await handler(toolUse.input, documentManager, env);
                      return {
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: JSON.stringify(result)
                      };
                    } catch (error) {
                      return {
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: JSON.stringify({ error: error.message })
                      };
                    }
                  })
                );

                // Build proper content blocks for assistant message
                const assistantContent = [];
                if (textContent) {
                  assistantContent.push({ type: 'text', text: textContent });
                }
                currentToolUses.forEach(tool => {
                  assistantContent.push({
                    type: 'tool_use',
                    id: tool.id,
                    name: tool.name,
                    input: tool.input
                  });
                });

                // Add to messages
                messages.push({
                  role: 'assistant',
                  content: assistantContent
                });

                messages.push({
                  role: 'user',
                  content: toolResultsForThisTurn
                });

                toolResults.push(...toolResultsForThisTurn);

                // Continue loop for next iteration
              } else {
                // Got final text response, break
                break;
              }
            }

            // Send completion signal with metadata
            await writer.write(encoder.encode(`data: ${JSON.stringify({
              type: 'done',
              ttsVoice: DEFAULT_TTS_VOICE,
              toolsUsed: toolResults.length > 0,
              usage: finalResponse ? {
                inputTokens: finalResponse.usage.input_tokens,
                outputTokens: finalResponse.usage.output_tokens,
                cacheCreationInputTokens: finalResponse.usage.cache_creation_input_tokens || 0,
                cacheReadInputTokens: finalResponse.usage.cache_read_input_tokens || 0,
              } : {}
            })}\n\n`));

            await writer.close();

          } catch (error) {
            console.error('Streaming error:', error);
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`));
            await writer.close();
          }
        })();

        // Return streaming response
        return new Response(readable, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });

      } catch (error) {
        console.error('Agent error:', error);
        return new Response(JSON.stringify({
          error: 'Failed to process agent request',
          details: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Voice endpoint
    if (url.pathname === '/voices') {
      return new Response(JSON.stringify({ voice: DEFAULT_TTS_VOICE }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Text-to-Speech endpoint using OpenAI TTS
    if (url.pathname === '/api/tts' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { text, voice = DEFAULT_TTS_VOICE } = body;

        if (!text) {
          return new Response(JSON.stringify({
            error: 'Text is required'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const selectedVoice = voice;

        // Call OpenAI TTS API
        const openaiResponse = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: text,
            voice: selectedVoice,
            response_format: 'mp3'
          })
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          throw new Error(`OpenAI TTS API error: ${errorText}`);
        }

        // Return the audio directly
        const audioData = await openaiResponse.arrayBuffer();

        return new Response(audioData, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioData.byteLength.toString(),
          },
        });

      } catch (error) {
        console.error('TTS error:', error);
        return new Response(JSON.stringify({
          error: 'Failed to generate speech',
          details: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Tools info endpoint
    if (url.pathname === '/tools') {
      return new Response(JSON.stringify({
        available_tools: tools.map(t => ({
          name: t.name,
          description: t.description
        }))
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        tools: tools.length,
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // API Info endpoint
    if (url.pathname === '/api' || url.pathname === '/api/info') {
      return new Response(JSON.stringify({
        message: 'AI Agent API with Tool Calling',
        version: '3.0',
        capabilities: [
          'Image analysis and recognition',
          'Survey creation and management',
          'Boiler recommendations',
          'Heating calculations',
          'Issue diagnosis',
          'Cost estimation',
          'Model comparison',
          'Document search with FTS'
        ],
        endpoints: {
          '/': 'GET - Chat Interface',
          '/documents.html': 'GET - Document Manager',
          '/documents/text': 'POST - Ingest raw text content as a document',
          '/agent': 'POST - Send message to agent (with tool calling and images)',
          '/api/documents/upload': 'POST - Upload PDF document',
          '/api/documents': 'GET - List documents',
          '/api/documents/{id}': 'DELETE - Delete document',
          '/api/documents/{id}/process': 'POST - Process document text',
          '/api/documents/{id}/json': 'GET - Get processed document JSON',
          '/api/documents/fts/health': 'GET - Check FTS index health',
          '/api/documents/fts/migrate': 'POST - Rebuild FTS index',
          '/api/tts': 'POST - Generate AI speech from text',
          '/voices': 'GET - Get default voice',
          '/tools': 'GET - Get available tools',
          '/health': 'GET - Health check',
        },
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // 404 for unknown routes
    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders,
    });
  },
};
