# Quickstart: BookKit Agents Dropdown

This quickstart is a **manual end-to-end check** that the UI can list BookKit agents/modes and use the selected agent/mode for the next message.

## Prereqs

- Node.js >= 18
- This repository installed (`npm install`)
- Web dependencies installed (`npm run web:install`)

## Run

1. Start the app:

   - `npm run dev`

2. Open the web UI (Vite prints the URL, usually `http://localhost:5173`).

3. Confirm the backend is healthy:

   - Visit `http://localhost:8787/api/health` and confirm `{ "ok": true }`.

4. Confirm BookKit integration is available:

   - Visit `http://localhost:8787/api/bookkit/status` and confirm `{ "ok": true }`.

5. Confirm agent list loads:

   - Visit `http://localhost:8787/api/bookkit/agents` and confirm you get a JSON response with `agents: [...]`.

6. In the UI:

   - Pick a book (create one if needed)
   - Pick an agent/mode from the dropdown
   - Start a session

7. Send a short prompt (example):

   - “Write the next paragraph of the introduction in a friendly tone.”

8. While it is responding, change the dropdown selection.

   Expected:

   - The current response continues.
   - The new selection applies to the next message.

## What counts as “working”

- Dropdown is populated from `/api/bookkit/agents`.
- Selecting an agent/mode changes the behavior of the *next* message.
- No crashes when BookKit is unavailable; user sees a clear error.
- Agent/mode is **not** stored or displayed in session history.
