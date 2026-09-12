# LLM Chat (llm.jimchen.me)

Minimal, fast single-user chat interface for Gemini.

- Messages are streamed (SSE) and persisted server-side in Redis
- Single password authentication
- Copy, edit, branch, delete any message; retry bot messages
- Markdown + KaTeX rendering via `vscode/markdown-it-katex`

## Modes

There are two conversation modes, and the mode **belongs to the conversation**:

| Mode | System prompt | Gemini API key |
| --- | --- | --- |
| 🛠 **Tech** (default) | `TECH_MODE_SYSTEM_PROMPT` (math/cs assistant) | `TECH_MODE_API_KEY` |
| 🎲 **Random** | none — talk about anything | `RANDOM_MODE_API_KEY` |

- New chats start in **Tech** mode. Switching the mode on an open conversation persists it, so a
  random conversation always comes back as a random conversation.
- Each mode has its own Gemini API key so usage is billed/tracked separately per mode. Keys and
  system prompts are resolved in the backend only — the frontend never handles API keys.

## Configuration

All secrets/prompts live in env vars — see `.env.example`:

```
REDIS_URL, APP_PASSWORD, DEFAULT_MODEL,
TECH_MODE_API_KEY, RANDOM_MODE_API_KEY, TECH_MODE_SYSTEM_PROMPT,
MOCK_LLM (optional)
```

## Development test mode

Outside production (`NODE_ENV !== 'production'`) the LLM is **mocked**: every message gets a fixed
reply ("You are in Mode 1 (Tech)" / "You are in Mode 2 (Random)") and no API keys are needed.
Set `MOCK_LLM=false` to make real Gemini calls during development.

## Run

```bash
npm install
cp .env.example .env   # fill in values
npm run dev            # test run (mocked LLM)
npm run build && npm start   # production (real LLM)
```
