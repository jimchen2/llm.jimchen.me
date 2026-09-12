# llm.jimchen.me

- A separate file to call the LLM, minimal and fast interface
- Enter sends the message in the frontend, autofocus on page load, stream the message, no pictures for now, parse the output with `vscode/markdown-it-katex`
- User can copy (purely on frontend), edit, branch, and delete any messages by user or bot, user can "retry" for every previous bot message, based on messages before that, user can copy the specific code snippets
  - Delete: Delete means deleting only the one message and not deleting anything else
  - Branch: Branch means duplicating the entire message so far and not having any more relationships
  - Retry: Retrying means first deleting the message, before invoking the LLM again
  - Copying Code Snippets: Do not generate the copy button dynamically many times or while the AI is streaming, generate it once hardcoded into the HTML
- All messages are saved on the server with Redis and PSQL, there is only one user with one password authentication, message continues if user closes the browser tab, timeout 120s

## Configuration (`.env`)

Everything secret or deployment specific lives in the server environment. Copy the
example file and fill in what you need:

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` | Redis server used to store conversations/messages. `REDIS_DRIVER=memory` forces the in-process development store. |
| `APP_PASSWORD` | The single access password. Development never asks for it (set `DEV_REQUIRE_AUTH=true` to test the login flow). |
| `GEMINI_API_KEY_TECH` | Gemini API key used by **mode 1 · tech**. |
| `GEMINI_API_KEY_RANDOM` | Gemini API key used by **mode 2 · random**. |
| `GEMINI_MODEL` | Default model, `gemini-3.8-flash`. `GEMINI_MODEL_TECH` / `GEMINI_MODEL_RANDOM` override it per mode. |
| `SYSTEM_PROMPT_TECH` | System instruction sent for tech conversations (mode 1). |
| `SYSTEM_PROMPT_RANDOM` | Empty on purpose: mode 2 is sent with **no system prompt at all**. |
| `LLM_MOCK` | Development only: `true` always answers with the fixed mock, `false` never does. |

API keys are never sent to the browser and can no longer be edited from the UI.

## The two modes

A mode is a property of a **conversation**, not of a single message. It is decided
when the conversation is created, stored in Redis with the conversation, and
resolved on the server for every answer (`lib/modes.js`, `lib/prompts.js`,
`lib/llm.js`). Coming back to a conversation therefore always gives you the same
mode back, and there is no expiring/temporary system prompt anywhere.

|  | Mode 1 · tech (default) | Mode 2 · random |
| --- | --- | --- |
| System prompt | `SYSTEM_PROMPT_TECH` | none at all (`SYSTEM_PROMPT_RANDOM` is empty) |
| API key | `GEMINI_API_KEY_TECH` | `GEMINI_API_KEY_RANDOM` |
| Used for | coding / math / research | anything |
| New conversations | start here | — |

Because each mode has its own API key, usage and cost can be attributed (and
billed) per mode on the backend. Each stored answer also keeps `mode`, `model`
and the token `usage` reported by Gemini.

## Development

```bash
npm install
npm run dev
```

Nothing has to be configured for a local run:

- no password is asked for,
- if Redis is not reachable, conversations are kept in an in-process store
  (they disappear when the dev server restarts),
- if a mode has no API key, the server answers with a **fixed mock answer** that
  tells you which mode you are in and whether a system prompt/key is configured —
  no request is made to Gemini. Put real keys in `.env` (or set `LLM_MOCK=true`
  to keep the mock) to switch to real answers.
