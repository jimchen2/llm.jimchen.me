- A separate file to call the LLM, minimal and fast interface
- User can set a default model, no default system instructions. User provides the API, but all the endpoints are in the backend, enter sends the message in the frontend, autofocus on page load, stream the message, no pictures for now, parse the output with `vscode/markdown-it-katex`
- User can copy (purely on frontend), edit, branch, and delete any messages by user or bot, user can "retry" for every previous bot message, based on messages before that, user can copy the specific code snippets
  - Delete: Delete means deleting only the one message and not deleting anything else
  - Branch: Branch means duplicating the entire message so far and not having any more relationships
  - Retry: Retrying means first deleting the message, before invoking the LLM again
- All messages are saved on the server with Redis and PSQL, there is only one user with one password authentication, message continues if user closes the browser tab, timeout 120s

Different conversation streaming messed up

Mobile width still has a problem
