# Workflow

This repo is designed around a simple loop:

1. **Define requirements** in `books/<bookId>/requirements/*.md`
2. **Generate the next chunk** into `books/<bookId>/book/draft.md`
3. **Review + edit** the draft (you can edit the markdown directly)
4. **Record feedback** in `books/<bookId>/requirements/feedback.md` (new constraints the next generation must follow)
5. Repeat

## Requirements are the source of truth

If the draft changes in a way that matters for future consistency (tone, character details, world rules, plot decisions), write it down in the requirements.

## Multi-book layout

Each book lives in its own folder:

- `books/<bookId>/requirements/` (constraints and feedback)
- `books/<bookId>/book/` (draft chapters/sections)
- `books/<bookId>/.sessions/` (session history logs)

`<bookId>` is a safe ID derived from the book’s display name so different books never overwrite each other.

## Chunking guidance

Smaller chunks are easier to review and keep on-track:

- 200–500 words: paragraph/beat level
- 800–1500 words: scene level
- 2000+ words: chapter segment

## The CLI

The Node CLI (in `src/`) uses `@github/copilot-sdk` to talk to the Copilot CLI via JSON-RPC.

Typical usage:

- Interactive session (recommended): `npm start`
- Generate a chunk (non-interactive): `npm run write -- --section "Chapter 1" --words 800`

Default model: `gpt-5-mini` (override with `--model` or `COPILOT_MODEL`).

## Web UI

If you prefer a browser UI, run:

- `npm run web:install`
- `npm run dev`

It shows:

- Chat (left)
- Live chapter stream + chapter files (right)

If requirements are missing/unclear, the model will call a local tool to ask you questions in the terminal.

## Review loop

During `npm start`, the tool writes one paragraph (or small chunk) at a time and then asks you if you like it.

- If you say it needs changes, you provide feedback and it updates the book files.
- If the feedback implies a new rule (tone, character detail, plot rule), it also updates `books/<bookId>/requirements/feedback.md` so future writing stays consistent.
