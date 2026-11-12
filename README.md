## Payment

https://console.cloud.google.com/billing/01C4BE-260939-9B2310/payment?project=gen-lang-client-0133736136
Google Cloud -> Billing -> Payment methods -> Overview -> How you pay

---

## Some Example Prompts

- **Weekly Report**: Based on this, write a weekly research report for PI. Note that PI usually doesn't want the tech details or jargon.  Focus on high level progress and you also need to have good communication details. Summarize it into a very short extract for me to send the email. (maybe you can paste the repo url and let the agent look for git commits within one week)
- **Minimal Changes** Just do () and do not change anything else, make very minimal changes and keep everything else the same
- **Writeup After Conversation** (First paste a whole conversation) Look at the logs of this conversation, give a writeup on how to make it work. Put all the scripts/commands that the person successfully executed and that ended up working. And what you need to change to make it work, what are problems encountered. Give a writeup. Give a writeup so that in future trainings I can just look at the writeup and know what to do quickly.
- **Tech Assistant** You are a technical/research assistant. Only answer questions related to math and cs. Be concise, do not make assumptions, and do not answer any off-topic queries
- **Short Answer** Answer very short and concisely, do not make it too long or too complicated
-  **Russian Grammar**
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
  - Delete: Delete means deleting only the one message and not deleting anything else
  - Branch: Branch means duplicating the entire message so far and not having any more relationships
  - Retry: Retrying means first deleting the message, before invoking the LLM again
  - Copying Code Snippets: Do not generate the copy button dynamically many times or while the AI is streaming, generate it once hardcoded into the HTML
- All messages are saved on the server with Redis and PSQL, there is only one user with one password authentication, message continues if user closes the browser tab, timeout 120s

Copy `.env.example` to `.env` and fill in:

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` | Redis connection string used for message/stream storage |
| `APP_PASSWORD` | The single app password, sent as `x-db-token` |
| `API_KEY` | Gemini API key — one key for **all** modes |
| `DEFAULT_MODEL` | Model used by **all** modes |
| `*_MODE_SYSTEM_PROMPT` | Optional system prompt overrides per mode |

Modes (`default`, `grammar`, `practical`) differ by their system prompt. All of
them keep the full conversation history.

- `/grammar` — Grammar mode: corrects Russian grammar before answering
  (`GRAMMAR_MODE_SYSTEM_PROMPT`).
- `/practical` — Practical mode: answers very short and concisely
  (`PRACTICAL_MODE_SYSTEM_PROMPT`).

Both modes use the same `API_KEY` and `DEFAULT_MODEL` as the default mode.

Random mode (a no-memory mode: `memory: 0` in
`lib/modes.js`, only the current message sent to the LLM) is currently
**disabled** — its entry in `lib/modes.js`, its routes (`app/random/**`) and its
UI wiring are commented out in place. Stored conversations with mode `random`
fall back to `default`. Uncomment those pieces (plus `RANDOM_MODE_SYSTEM_PROMPT`
in `.env.example`) to bring it back.
There are no per-mode API keys or models; `GEMINI_API_KEY` and the legacy
`DEFAULT_MODE_API_KEY` are still accepted as aliases of `API_KEY`.
