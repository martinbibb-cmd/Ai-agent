import Anthropic from '@anthropic-ai/sdk';
import personas from '../data/personas.json';

// Voice mapping for TTS
const VOICE_MAPPING = {
  'janet': 'shimmer',
  'rocky': 'alloy',
  'heart_of_gold': 'verse',
  'marvin': 'botanica',
  'sonny': 'lumina'
};

// Core system prompt shared across all personas
const CORE_SYSTEM_PROMPT = `You are an AI assistant specialized in helping with surveys and boiler-related inquiries. Your knowledge includes:

- Home heating systems, boilers, and HVAC equipment
- Energy efficiency and heating optimization
- Boiler maintenance, troubleshooting, and replacement
- Survey methodology and best practices
- Data collection and analysis

You use the following tools and capabilities to assist users:
- Answer questions about boiler systems, specifications, and recommendations
- Help conduct surveys and gather information systematically
- Provide detailed, accurate technical information
- Guide users through decision-making processes

Always be helpful, accurate, and thorough in your responses.`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Enable CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Serve personas.json
    if (url.pathname === '/data/personas.json') {
      return new Response(JSON.stringify(personas), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Agent endpoint
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
        const messages = [
          ...conversationHistory,
          {
            role: 'user',
            content: message,
          },
        ];

        // Call Anthropic API
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 4096,
          system: fullSystemPrompt,
          messages: messages,
        });

        // Extract the response text
        const responseText = response.content[0].text;

        return new Response(JSON.stringify({
          response: responseText,
          personaId: personaId,
          voiceHint: voiceHint,
          ttsVoice: VOICE_MAPPING[personaId] || 'shimmer',
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
          details: error.message
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

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        personas: personas.length,
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Default response for root
    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        message: 'AI Agent API',
        endpoints: {
          '/data/personas.json': 'Get available personas',
          '/agent': 'POST - Send message to agent',
          '/voices': 'Get voice mapping',
          '/health': 'Health check',
        },
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders,
    });
  },
};
