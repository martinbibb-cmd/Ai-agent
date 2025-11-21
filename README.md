# AI Agent - Multi-Persona Assistant

A Cloudflare Workers-based AI agent with multi-persona support for surveys and boiler-related inquiries. Built with Anthropic's Claude API.

## Features

- **5 Unique Personas**: Janet, Rocky, Heart of Gold, Marvin, and Sonny
- **Dynamic Persona Switching**: Switch between personalities on-the-fly
- **Conversation History**: Maintains context throughout the conversation
- **TTS Voice Mapping**: Each persona maps to a specific text-to-speech voice
- **Advanced Tool Calling**: Claude uses specialized tools for complex tasks
- **Survey Management**: Create, conduct, and manage surveys with various question types
- **Boiler Expertise**: Comprehensive knowledge base with 13+ boiler models
- **Heating Calculations**: BTU requirements, sizing, and efficiency analysis
- **Issue Diagnosis**: Troubleshoot boiler problems with safety-first approach
- **Cost Estimation**: Installation and repair cost estimates
- **Modern UI**: Clean, responsive interface with real-time chat

## Architecture

### Personas

All personas are stored in `data/personas.json` with the following structure:

```json
{
  "id": "persona_id",
  "label": "Display Name - Description",
  "default": true/false,
  "voiceHint": "voice_name",
  "systemPrompt": "Personality and communication style..."
}
```

#### Available Personas:

1. **Janet** (default) - Friendly & Professional (voice: shimmer)
2. **Rocky** - Energetic & Motivating (voice: alloy)
3. **Heart of Gold** - Quirky & Cheerful (voice: verse)
4. **Marvin** - Dry & Sardonic (voice: botanica)
5. **Sonny** - Curious & Thoughtful (voice: lumina)

### Agent Tools

The agent has access to 7 specialized tools for handling complex tasks:

1. **create_survey** - Create structured surveys with multiple question types
2. **recommend_boiler** - Recommend boilers based on home specs and requirements
3. **calculate_heating_needs** - Calculate BTU requirements for homes
4. **diagnose_boiler_issue** - Diagnose problems based on symptoms
5. **compare_boilers** - Compare multiple boiler models side-by-side
6. **estimate_installation_cost** - Estimate total installation costs
7. **save_survey_response** - Save and track survey responses

The agent automatically decides when to use tools based on the conversation context.

### Backend (Cloudflare Worker)

The Worker (`src/index.js`) provides the following endpoints:

- `GET /` - API information and capabilities
- `GET /data/personas.json` - Fetch available personas
- `POST /agent` - Send messages to agent (with automatic tool calling)
- `GET /voices` - Get TTS voice mappings
- `GET /tools` - Get available tools info
- `GET /health` - Health check with tool count

#### Agent Request Format

```json
{
  "personaId": "janet",
  "personaSystem": "You are Janet, a warm, friendly...",
  "voiceHint": "shimmer",
  "message": "Hello, can you help me?",
  "conversationHistory": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

#### Agent Response Format

```json
{
  "response": "Assistant's response text...",
  "personaId": "janet",
  "voiceHint": "shimmer",
  "ttsVoice": "shimmer",
  "usage": {
    "inputTokens": 123,
    "outputTokens": 456
  }
}
```

### Frontend

The frontend (`public/index.html`) is a single-page application that:

- Loads personas from `/data/personas.json` on startup
- Displays persona selection buttons
- Maintains conversation history per persona
- Sends formatted requests to the `/agent` endpoint
- Displays chat messages in real-time

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account
- Anthropic API key

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd Ai-agent
```

2. Install dependencies:
```bash
npm install
```

3. Configure the Anthropic API key:
```bash
wrangler secret put ANTHROPIC_API_KEY
```
Enter your API key when prompted.

### Development

Run locally with Wrangler:
```bash
npm run dev
```

The worker will be available at `http://localhost:8787`

### Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

Your worker will be deployed to: `ai-agent.martinbibb.workers.dev`

## Configuration

### Adding New Personas

1. Edit `data/personas.json`
2. Add a new persona object with required fields:
   - `id`: Unique identifier (lowercase, underscores)
   - `label`: Display name with description
   - `default`: Boolean (only one should be true)
   - `voiceHint`: Voice identifier
   - `systemPrompt`: Personality description

3. Update voice mapping in `src/index.js` if adding a new TTS voice

### Customizing the Core System Prompt

Edit the `CORE_SYSTEM_PROMPT` constant in `src/index.js` to modify the shared knowledge base and capabilities across all personas.

## API Usage

### Example: Sending a Message

```javascript
const response = await fetch('https://ai-agent.martinbibb.workers.dev/agent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    personaId: 'janet',
    personaSystem: 'You are Janet, a warm, friendly...',
    voiceHint: 'shimmer',
    message: 'What type of boiler should I get for a 180m² home?',
    conversationHistory: []
  })
});

const data = await response.json();
console.log(data.response);
```

## Project Structure

```
Ai-agent/
├── data/
│   └── personas.json          # Persona configurations
├── public/
│   └── index.html            # Frontend UI
├── src/
│   ├── index.js              # Cloudflare Worker backend with tool calling
│   ├── tools/
│   │   ├── definitions.js    # Tool schemas for Claude
│   │   └── handlers.js       # Tool execution logic
│   └── knowledge/
│       └── boilers.js        # Boiler database and knowledge base
├── .gitignore
├── package.json
├── wrangler.toml             # Cloudflare configuration
└── README.md
```

## Example Use Cases

### Boiler Recommendation
"I have a 180m² home with 3 bedrooms and 2 bathrooms. I prefer gas and want something energy efficient. What boiler should I get?"

→ Agent uses `calculate_heating_needs` and `recommend_boiler` tools to provide data-driven recommendations.

### Survey Creation
"I need to create a survey about customer satisfaction with boiler installations"

→ Agent uses `create_survey` tool to generate a structured survey with appropriate question types.

### Troubleshooting
"My boiler is making strange noises and the pressure is low. It's 8 years old."

→ Agent uses `diagnose_boiler_issue` tool to identify possible causes and suggest solutions.

### Cost Planning
"How much would it cost to install a new combi gas boiler to replace my old system?"

→ Agent uses `estimate_installation_cost` tool with installation complexity assessment.

## Units
This agent uses **UK metric units**:
- Home size: square metres (m²)
- Boiler output: kilowatts (kW)
- Dimensions: millimetres (mm)
- Temperature: Celsius (°C)

## Technologies

- **Runtime**: Cloudflare Workers (V8 isolates)
- **AI Model**: Anthropic Claude (Sonnet 4.5) with tool calling
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Build Tool**: Wrangler 3.0
- **Architecture**: Serverless with edge compute

## Security

- API key stored as Cloudflare Worker secret
- CORS enabled for cross-origin requests
- Input validation on all endpoints
- No sensitive data logged

## License

MIT

## Support

For issues or questions, contact the development team or create an issue in the repository.
