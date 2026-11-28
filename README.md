## Payment

https://console.cloud.google.com/billing/01C4BE-260939-9B2310/payment?project=gen-lang-client-0133736136
Google Cloud -> Billing -> Payment methods -> Overview -> How you pay

---

## Some Example Prompts

- **Weekly Report**: Based on this, write a weekly research report for PI. Note that PI usually doesn't want the tech details or jargon.  Focus on high level progress and you also need to have good communication details. Summarize it into a very short extract for me to send the email. (maybe you can paste the repo url and let the agent look for git commits within one week)
- **Minimal Changes** Just do () and do not change anything else, make very minimal changes and keep everything else the same
- **Writeup After Conversation** (First paste a whole conversation) Look at the logs of this conversation, give a writeup on how to make it work. Put all the scripts/commands that the person successfully executed and that ended up working. And what you need to change to make it work, what are problems encountered. Give a writeup. Give a writeup so that in future trainings I can just look at the writeup and know what to do quickly.
- **Tech Assistant** You are a technical/research assistant. Only answer questions related to math and cs. Be concise, do not make assumptions, and do not answer any off-topic queries.
- **Short conversation mode** Be conversational and answer very shortly and concisely. Each conversation is limited to five exchanges (10 messages).
- **Short Answer** Answer very short and concisely, do not make it too long or too complicated
- **Polish the Question** Try to repeat and slightly polish this question. then answer it
-  **Russian mode**
```
Сначала исправьте грамматические ошибки, затем ответьте.

Как исправить грамматику? (если по русскому)

1. Мужской род для пользователя. Игнорируй букву «ё»: если вместо «ё» написано «е», считай это правильным и не исправляй.

2. Перепиши предложение с исправлениями прямо в тексте:

- Выдели неправильные слова ~~зачеркиванием~~ (тильда с обеих сторон)

- Сразу после напиши правильное слово **жирным шрифтом** (звёздочки с обеих сторон)

3. Знаки препинания исправляй или добавляй без выделений (не используй для них ~~зачеркивание~~ и **жирный шрифт**).

Пример:

Ввод: Я пошла в магазине и купила хлеб а потом пошла спать.

Вывод: Я ~~пошла~~ **пошел** в ~~магазине~~ **магазин** и ~~купила~~ **купил** хлеб, а потом ~~пошла~~ **пошел** спать.

Если текст не на русском языке, или есть английские слова, отвечайте прямо и на русском языке.
```

---

https://github.com/jimchen2/llm.jimchen.me/raw/refs/heads/master/public/annoying-website.user.js

---

## Website/Configuration

- A separate file to call the LLM. Minimal and fast interface
- User can set a default model, no default system instructions. User provides the API, but all the endpoints are in the backend, enter sends the message in the frontend, autofocus on page load, stream the message, no pictures for now, parse the output with `vscode/markdown-it-katex`
- User can copy (purely on frontend), edit, branch, and delete any messages by user or bot, user can "retry" for every previous bot message, based on messages before that, user can copy the specific code snippets
  - Sticky header: the model name and the message actions stay pinned to the top of the chat pane while a long message scrolls past (the Telegram theme keeps only the sender line and moves the actions into a right-click / single-tap menu)
  - Delete: Delete means deleting only the one message and not deleting anything else
  - Branch: Branch means duplicating the entire message so far and not having any more relationships
  - Retry: Retrying means first deleting the message, before invoking the LLM again
  - Copying Code Snippets: Do not generate the copy button dynamically many times or while the AI is streaming, generate it once hardcoded into the HTML
- All messages are saved on the server with Redis and PSQL, there is only one user with one password authentication, message continues if user closes the browser tab, timeout 120s
- Random mode (`/random`): no system prompt at all. Its conversations look and
  behave like every other conversation on any device; on a phone or tablet the
  chat is read-only (the history is visible, the composer and the message
  actions are not). Its conversations, messages and sidebar entry never expire
  in Redis. See [Random
  mode](#random-mode-visible-everywhere-read-only-on-phones-no-redis-expiry).

### Themes

Settings → Theme switches the appearance and remembers the choice in a
`theme` cookie:

- **Light** — the original Bootstrap layout.
- **Dark** — Dark Reader over the original layout.
- **Brutalist** — opt-in black/white/acid-yellow hard-edged stylesheet
  (`app/brutalist.css`).
- **Telegram** — opt-in replica of a light Telegram Day-theme chat
  (`app/telegram.css`): white chat list with round avatars, patterned
  wallpaper, white incoming / mint `#effdde` outgoing bubbles with tails and
  timestamps, a contact header with the model name, and a floating composer
  with a round blue paper-plane send button. Only the Telegram theme shows the
  chat header and per-message times; the other themes hide them. It also speaks
  Telegram's own interaction language:
  - **The chat-list circle says what kind of conversation a row is.** Each
    mode gets its own Telegram avatar color and glyph (default `{ }`, Russian
    mode a pencil, short conversation mode a bolt, random mode a sparkle), and
    the mode's name sits under the title like a Telegram message preview. The
    contact-bar avatar repeats it for the open chat.
  - **Message actions are not pinned to the bubble.** Copy / Edit / Branch /
    Retry / Delete (and the branch switcher) live in a popup menu, opened by
    right-clicking a message on a computer or by a single tap on a phone or
    tablet — the way Telegram itself works. Every other theme keeps the
    visible action row unchanged.

### Preview without any services

```bash
cp .env.example .env
printf 'TEST_MODE=true\n' >> .env
npm install && npm run dev   # http://localhost:3000
```

With `TEST_MODE=true` there is no password prompt, no Redis and no API key:
the sidebar shows a few fixed sample conversations (code, KaTeX math, Russian
grammar, short-conversation mode, random mode) and sending a message streams a
canned reply so the streaming UI can be exercised. Everything resets on
restart.

For the full setup, copy `.env.example` to `.env` and fill in:

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` | Redis connection string used for message/stream storage |
| `APP_PASSWORD` | The single app password, sent as `x-db-token` |
| `TEST_MODE` | Set to `true` to skip the password and load a few sample conversations (see `lib/testConversations.js`). No Redis and no API key are needed: data lives in memory (`lib/memoryStore.js`) and replies are canned. Off by default; do not enable it on a public deployment |
| `API_KEY` | Gemini API key — one key for **all** modes |
| `DEFAULT_MODEL` | Model used by **all** modes |
| `*_MODE_SYSTEM_PROMPT` | Optional system prompt overrides per mode |

Modes (`default`, `grammar`, `practical`, `random`) differ by their system
prompt. All of them keep the full conversation history.

- `/russian` — Russian mode: corrects Russian grammar before answering
  (`GRAMMAR_MODE_SYSTEM_PROMPT`).
- `/practical` — short conversation mode: five exchanges (ten messages) per
  conversation (`PRACTICAL_MODE_SYSTEM_PROMPT`).
- `/random` — random mode: **no system prompt at all**, the conversation is sent
  exactly as typed. `RANDOM_MODE_SYSTEM_PROMPT` is intentionally ignored.

Every mode uses the same `API_KEY` and `DEFAULT_MODEL`; there are no per-mode
keys or models. `GEMINI_API_KEY` and the legacy `DEFAULT_MODE_API_KEY` are still
accepted as aliases of `API_KEY`.

#### Random mode (visible everywhere, read-only on phones, no Redis expiry)

Random mode is a normal, always-visible mode. It is only **read-only on a
phone or tablet**:

- Open Settings → Mode and choose **Random mode — no system prompt** on any
  device (the `4` key also selects it while Settings is open). To leave it,
  choose another mode from the same dropdown.
- Its conversations are listed in the sidebar exactly like the others, on every
  device, and `/random` / `/random/chat/[id]` open normally instead of
  redirecting. The whole history renders as usual.
- On a phone or tablet — including a phone that requests the browser's
  "desktop site" — the composer is disabled and Edit / Branch / Delete are
  hidden, with a "read-only on this device" notice. Copy and branch navigation
  keep working. `lib/desktopGate.js` requires a hover-capable, fine primary
  pointer (`hover: hover and pointer: fine`), so a phone fails the check even
  when its User-Agent pretends to be a desktop.
- The API keeps the matching write check: `/api/chat` and `POST
  /api/conversations` only accept `mode: "random"` when the request carries the
  `x-random-mode-unlocked: 1` header (set by the client on a computer only) and
  is not a mobile User-Agent. Reading (`GET /api/conversations`, `GET
  /api/messages`) is never gated, and the saved mode (`/api/settings`) can be
  random on any device. This is a UI gate, not a security boundary.
- Its conversations never expire in Redis: `conv:{id}`, `msgs:{id}` and the
  shared `conversations:index` are written without a TTL (and `PERSIST` clears
  any earlier one), while every other mode keeps `CACHE_TTL_SECONDS`. Should an
  older index still have kept a TTL, `GET /api/conversations` recovers random
  conversations from `conv:*` and persists the index again, so they never
  disappear from the sidebar. Deleting a random-mode conversation is still
  possible (the `×` button / `DELETE /api/conversations`) — it just never
  expires on its own.
