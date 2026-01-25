---
agent: speckit.constitution
---

# Copilot Book Writer — Constitution

This repository builds a “book writing agent” using the GitHub Copilot SDK.

## Non-negotiables

- **Requirements-first**: the book must be driven by files in `requirements/`. If something changes, update requirements so constraints remain accurate.
- **Incremental writing**: generate the book in small, reviewable chunks (chapter/scene/section/paragraph), never “one-shot” an entire full-length book.
- **Human-in-the-loop**: the user can edit `book/draft.md` directly. The tooling should treat the draft as authoritative and help reconcile edits back into requirements.
- **Traceability**: when requirements change, store a short rationale in `requirements/feedback.md` (what changed and why).

## Workflow conventions

- Requirements files are plain Markdown, one purpose per file.
- The CLI should read:
	- all requirements
	- the current draft
	- and a requested target section (e.g., “Chapter 3 / Scene 2”)
	then generate the next chunk.

## Interaction pattern

- Prefer asking clarifying questions when requirements are missing or conflicting.
- Questions should be **specific** and **few** (ideally 1–4), and answers should be recorded as updated requirements.

## Output conventions

- Write output into `book/draft.md`.
- Preserve the user’s existing text unless explicitly instructed to rewrite it.

