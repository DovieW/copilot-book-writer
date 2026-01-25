# Workflow

This repo is designed around a simple loop:

1. **Define requirements** in `requirements/*.md`
2. **Generate the next chunk** into `book/draft.md`
3. **Review + edit** the draft (you can edit the markdown directly)
4. **Record feedback** in `requirements/feedback.md` (new constraints the next generation must follow)
5. Repeat

## Requirements are the source of truth

If the draft changes in a way that matters for future consistency (tone, character details, world rules, plot decisions), write it down in the requirements.

## Chunking guidance

Smaller chunks are easier to review and keep on-track:

- 200–500 words: paragraph/beat level
- 800–1500 words: scene level
- 2000+ words: chapter segment

## The CLI

The Node CLI (in `src/`) uses `@github/copilot-sdk` to talk to the Copilot CLI via JSON-RPC.

Typical usage:

- Generate a chunk: `npm run write -- --section "Chapter 1" --words 800`

If requirements are missing/unclear, the model can call a local tool to ask you questions in the terminal.
