- A separate file to call the LLM, minimal and fast interface
- User can set a default model, no default system instructions. User provides the API, but all the endpoints are in the backend, enter sends the message in the frontend, autofocus on page load, stream the message, no pictures for now, parse the output with `vscode/markdown-it-katex`
- User can copy (purely on frontend), edit, branch, and delete any messages by user or bot, user can "retry" for every previous bot message, based on messages before that, user can copy the specific code snippets
  - Delete: Delete means deleting only the one message and not deleting anything else
  - Branch: Branch means duplicating the entire message so far and not having any more relationships
  - Retry: Retrying means first deleting the message, before invoking the LLM again
  - Copying Code Snippets: Do not generate the copy button dynamically many times or while the AI is streaming, generate it once hardcoded into the HTML
- All messages are saved on the server with Redis and PSQL, there is only one user with one password authentication, message continues if user closes the browser tab, timeout 120s

## Grammar checker (`/grammar`)

A Grammarly-style page: one large input box plus a suggestions panel. It is not
the chat page — there is no conversation, no message list, no branching.

- **Same frontend secret.** The page reads the access password from
  `localStorage.db_access_token` (the one the chat page stores) and sends it as
  the `x-db-token` header to `POST /api/grammar`. If there is no secret — or it
  is stale — the page redirects back to the chat frontend at `/`, which asks for
  the password again.
- **Idle-friendly auto-check.** While you type, the page re-checks every few
  seconds (2/3/5/10s, or off). It only ever sends *finished* text: everything up
  to the last `.`/`!`/`?`/`…` or paragraph break, so a half-typed word is never
  corrected. If the text has no sentence ending yet, it is checked as a whole
  once you pause. Unchanged text is never sent — the derived prefix is compared
  against the last one, and identical texts are served from a shared Redis cache
  (`grammar:v1:<sha256(model+text)>`), so a reload or a second visit is instant.
- **Prompt.** `GRAMMAR_SYSTEM_PROMPT` in `lib/grammar.js` is the spec prompt
  (strike-through the wrong word with `~~…~~`, immediately follow it with the
  fix in `**…**`, punctuation silently fixed, Russian / masculine forms) plus
  one line asking for the corrected text only, since the page renders the answer
  directly. `/api/grammar` is a single non-streaming request, not an SSE stream.
- **Suggestions panel.** Parses the markup into `~~wrong~~ → **right**` rows,
  and offers a *corrected text* tab with a markup view (red strike-through /
  green replacement) and a clean view that can be copied or applied back to the
  editor. `Ctrl`/`⌘` + `Enter` checks everything immediately, including the
  sentence still being typed.
- **Config (optional):** `GRAMMAR_MODE_API_KEY` and `GRAMMAR_MODEL` override the
  defaults; otherwise the `default` mode's key and `DEFAULT_MODEL` are used.
  `GEMINI_API_BASE_URL` can point the LLM calls at a proxy or self-hosted
  endpoint (unset in production = the official API).
- The page is linked from the chat sidebar ("✓ Grammar checker").
