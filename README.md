- A separate file to call the LLM, minimal and fast interface
- User can set a default model, no default system instructions. User provides the API, but all the endpoints are in the backend, enter sends the message in the frontend, autofocus on page load, stream the message, no pictures for now, parse the output with `vscode/markdown-it-katex`
- User can copy (purely on frontend), edit, branch, and delete any messages by user or bot, user can "retry" for every previous bot message, based on messages before that, user can copy the specific code snippets
  - Delete: Delete means deleting only the one message and not deleting anything else
  - Branch: Branch means duplicating the entire message so far and not having any more relationships
  - Retry: Retrying means first deleting the message, before invoking the LLM again
  - Copying Code Snippets: Do not generate the copy button dynamically many times or while the AI is streaming, generate it once hardcoded into the HTML
- All messages are saved on the server with Redis and PSQL, there is only one user with one password authentication, message continues if user closes the browser tab, timeout 120s

## Configuration

Copy `.env.example` to `.env` and fill in:

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` | Redis connection string used for message/stream storage |
| `APP_PASSWORD` | The single app password, sent as `x-db-token` |
| `API_KEY` | Gemini API key — one key for **all** modes |
| `DEFAULT_MODEL` | Model used by **all** modes |
| `*_MODE_SYSTEM_PROMPT` | Optional system prompt overrides per mode |

Modes (`default`, `random`, `grammar`) differ only by their system prompt.
There are no per-mode API keys or models; `GEMINI_API_KEY` and the legacy
`DEFAULT_MODE_API_KEY` are still accepted as aliases of `API_KEY`.
