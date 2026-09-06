# LLM Chat (llm.jimchen.me)

- A separate file to call the LLM, minimal and fast interface
- One user, one access password (`APP_PASSWORD`); all API routes are protected server-side by `proxy.js` (Next.js 16's replacement for middleware — the old `lib/middleware.js` was never executed, so APIs were effectively open)
- User provides the API key, model and system prompt in Settings (stored in Redis)
- Enter sends, autofocus on load, streaming output via SSE (`/api/chatstream`), markdown + KaTeX rendering
- Streams are resumable: every chunk is persisted to Redis, so refreshing the tab mid-generation reconnects to the same stream; dropped connections reconnect with backoff
- Thinking level (minimal/low/medium/high) can be tuned in Settings
- Messages support copy (frontend only), edit, branch, delete and retry, using a doubly linked list (`parent_id`):
  - Delete: deletes only that message; children are re-parented
  - Branch: duplicates the full chain into a new conversation
  - Retry: deletes the bot message, then regenerates from its parent
  - Copy buttons inside code fences are rendered server-side once (not re-created while streaming)
- All messages are saved in Redis (`CACHE_TTL_SECONDS`, default 86400); LLM call timeout is 120s (`LLM_TIMEOUT_MS`)

## Environment

```bash
cp .env.example .env.local
# REDIS_URL=redis://localhost:6379
# APP_PASSWORD=<your password>
# npm i && npm run dev
```

## Notes

- `gemini-3.7-flash` is the default model; Settings offers suggestions for current Gemini models and accepts any model id.
- `lib/prompts.txt` is a leftover prompt draft, not loaded by the app.
