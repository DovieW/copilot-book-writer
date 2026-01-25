# Copilot Book Writer

Create full-length books **incrementally** using the GitHub Copilot SDK.

The core idea:

1. You write/maintain a set of **requirements files** (what the book must be).
2. The tool generates the book **part by part** (chapter/scene/paragraph chunks).
3. When you edit the draft and add feedback, the tool helps apply changes **and** updates the requirements to keep constraints in sync.

## Repo layout

- `requirements/` — The source of truth (constraints, outline, style, etc.)
- `book/` — The current draft output
- `docs/` — How the workflow works, conventions, and future ideas
- `src/` — A small Node/TypeScript CLI that talks to Copilot via `@github/copilot-sdk`

## Quick start

Prereqs:

- Node.js 18+
- GitHub Copilot CLI installed and available as `copilot`

Install deps:

- `npm install`

Start the interactive experience:

- `npm start`

It will ask you (via questions in the terminal) whether you want **easy mode** or **hard mode**, then guide you through filling out `requirements/` and writing the book paragraph-by-paragraph.

Generate a first chunk:

- `npm run write -- --section "Chapter 1" --words 800`

By default it uses the model `gpt-5-mini`. You can override with `--model` or `COPILOT_MODEL`.

The draft is written to `book/draft.md`.

## How to use (simple explanation)

Think of `requirements/*.md` as “rules for the book”. The generator reads those rules and your existing draft, then writes the next piece. If you change the draft later, you can capture new constraints in `requirements/feedback.md` so future generations don’t “forget” what you changed.

## License

TBD
