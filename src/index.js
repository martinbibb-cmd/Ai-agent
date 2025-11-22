import Anthropic from '@anthropic-ai/sdk';
import personas from '../data/personas.json';
import { tools } from './tools/definitions.js';
import { toolHandlers } from './tools/handlers.js';
import { DocumentManager } from './documents/manager.js';

// Voice mapping for TTS
const VOICE_MAPPING = {
  'janet': 'shimmer',
  'rocky': 'alloy',
  'heart_of_gold': 'verse',
  'marvin': 'botanica',
  'sonny': 'lumina'
};

// Core system prompt shared across all personas
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
3. Explain technical concepts in ways appropriate to your persona
4. When recommending boilers, consider home size (in m²), budget, and efficiency needs
5. For troubleshooting, assess safety first - always recommend Gas Safe registered engineer for gas/safety issues
6. Be thorough but conversational
7. Use UK metric units in all calculations and recommendations

You have access to specialized tools - use them when appropriate to provide the best assistance.`;

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
        !url.pathname.startsWith('/api')) {

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

    // Serve personas.json
    if (url.pathname === '/data/personas.json') {
      return new Response(JSON.stringify(personas), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Upload document endpoint
    if (url.pathname === '/api/documents/upload' && request.method === 'POST') {
      if (!documentManager) {
        return new Response(JSON.stringify({
          error: 'Document storage not configured'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const formData = await request.formData();
        const file = formData.get('file');
        const category = formData.get('category') || 'general';
        const tags = formData.get('tags') ? JSON.parse(formData.get('tags')) : [];

        if (!file) {
          return new Response(JSON.stringify({
            error: 'No file provided'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const result = await documentManager.uploadDocument(file, {
          filename: file.name,
          contentType: file.type,
          category,
          tags,
          uploadedBy: 'user'
        });

        return new Response(JSON.stringify({
          success: true,
          document: result
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        console.error('Upload error:', error);
        return new Response(JSON.stringify({
          error: 'Upload failed',
          details: error.message
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

    // Delete document endpoint
    if (url.pathname.startsWith('/api/documents/') && request.method === 'DELETE') {
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
        await documentManager.deleteDocument(documentId);

        return new Response(JSON.stringify({
          success: true,
          message: 'Document deleted'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        console.error('Delete error:', error);
        return new Response(JSON.stringify({
          error: 'Failed to delete document',
          details: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Agent endpoint with tool calling
    if (url.pathname === '/agent' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { personaId, personaSystem, voiceHint, message, conversationHistory = [] } = body;

        // Validate required fields
        if (!personaId || !personaSystem || !message) {
          return new Response(JSON.stringify({
            error: 'Missing required fields: personaId, personaSystem, and message are required'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Initialize Anthropic client
        const anthropic = new Anthropic({
          apiKey: env.ANTHROPIC_API_KEY,
        });

        // Combine core system prompt with persona system prompt
        const fullSystemPrompt = `${CORE_SYSTEM_PROMPT}\n\n---\n\nPERSONALITY AND COMMUNICATION STYLE:\n${personaSystem}`;

        // Build messages array from conversation history
        let messages = [
          ...conversationHistory,
          {
            role: 'user',
            content: message,
          },
        ];

        // Tool calling loop - continue until we get a text response
        let response;
        let toolResults = [];
        const maxIterations = 10; // Prevent infinite loops
        let iteration = 0;

        while (iteration < maxIterations) {
          iteration++;

          // Call Anthropic API with tools
          response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            system: fullSystemPrompt,
            messages: messages,
            tools: tools,
          });

          // Check if Claude wants to use tools
          if (response.stop_reason === 'tool_use') {
            // Find all tool use blocks
            const toolUses = response.content.filter(block => block.type === 'tool_use');

            // Execute each tool
            const toolResultsForThisTurn = await Promise.all(
              toolUses.map(async (toolUse) => {
                try {
                  const handler = toolHandlers[toolUse.name];
                  if (!handler) {
                    return {
                      type: 'tool_result',
                      tool_use_id: toolUse.id,
                      content: JSON.stringify({ error: `Tool ${toolUse.name} not found` })
                    };
                  }

                  // Pass documentManager to document-related tools
                  const result = await handler(toolUse.input, documentManager);
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

            // Add assistant's response with tool uses to messages
            messages.push({
              role: 'assistant',
              content: response.content
            });

            // Add tool results to messages
            messages.push({
              role: 'user',
              content: toolResultsForThisTurn
            });

            toolResults.push(...toolResultsForThisTurn);

            // Continue loop to get Claude's response after tool use
          } else {
            // We got a text response, break the loop
            break;
          }
        }

        // Extract the final response text
        const textBlocks = response.content.filter(block => block.type === 'text');
        const responseText = textBlocks.map(block => block.text).join('\n\n');

        return new Response(JSON.stringify({
          response: responseText,
          personaId: personaId,
          voiceHint: voiceHint,
          ttsVoice: VOICE_MAPPING[personaId] || 'shimmer',
          toolsUsed: toolResults.length > 0,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
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

    // Voice mapping endpoint (for reference)
    if (url.pathname === '/voices') {
      return new Response(JSON.stringify(VOICE_MAPPING), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
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
        personas: personas.length,
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
        version: '2.0',
        capabilities: [
          'Multi-persona support',
          'Survey creation and management',
          'Boiler recommendations',
          'Heating calculations',
          'Issue diagnosis',
          'Cost estimation',
          'Model comparison',
          'Document search'
        ],
        endpoints: {
          '/': 'GET - Chat Interface',
          '/documents.html': 'GET - Document Manager',
          '/data/personas.json': 'GET - Get available personas',
          '/agent': 'POST - Send message to agent (with tool calling)',
          '/api/documents/upload': 'POST - Upload PDF document',
          '/api/documents': 'GET - List documents',
          '/api/documents/{id}': 'DELETE - Delete document',
          '/api/documents/{id}/process': 'POST - Process document text',
          '/api/documents/{id}/json': 'GET - Get processed document JSON',
          '/voices': 'GET - Get voice mapping',
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
