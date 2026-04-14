- A separate file to call the LLM, minimal and fast interface
- User can set a default model, no default system instructions. User provides the API, but all the endpoints are in the backend, enter sends the message in the frontend, autofocus on page load, stream the message, no pictures for now, parse the output with `vscode/markdown-it-katex`
- User can copy (purely on frontend), edit (change a node in the message list), branch (duplicate the message list up to the message), and delete (delete a node in the message list) any messages by use r or bot, user can "retry" for every previous bot message (change a node in the message list and add it) based on messages before that, user can copy the specific code snippets
- All messages are saved on the server with Redis and PSQL, there is only one user with one password authentication, message continues if user closes the browser tab, timeout 120s

Frontend retry behavior

Different conversation streaming messed up

Mobile width still has a problem
