# Copilot Book Writer Constitution

This repo exists to create full-length books **incrementally** using the GitHub Copilot SDK.

## Core principles

### 1) Requirements-first

- `books/<bookId>/requirements/` is the source of truth.
- If the draft changes in a way that affects future consistency, capture it as a requirement (usually in `requirements/feedback.md`).

### 2) Small, reviewable chunks

- Never try to generate an entire book in one run.
- Prefer chapter/scene/section sized output so humans can review and correct.

### 3) Human-in-the-loop, always

- The user can directly edit `books/<bookId>/book/draft.md`.
- Tooling must preserve user edits unless explicitly instructed to rewrite.

### 4) Ask when uncertain

- If requirements are missing or conflicting, ask 1–4 targeted questions.
- Record resolved answers back into requirements so the system “learns” constraints.

## Workflow

1. Fill in `books/<bookId>/requirements/*.md`
2. Run the generator to write the next chunk
3. Review/edit the draft
4. Add feedback constraints to requirements
5. Repeat

See `docs/WORKFLOW.md` for the “dumbed down” version.

## Governance

- This constitution supersedes templates.
- If you introduce a new convention, document it in `docs/`.

**Version**: 0.1.0 | **Ratified**: 2026-01-25 | **Last Amended**: 2026-01-25
