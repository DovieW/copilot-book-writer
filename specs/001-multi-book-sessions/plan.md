# Implementation Plan: Multi-book Sessions & History

**Branch**: `[001-multi-book-sessions]` | **Date**: 2026-01-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-multi-book-sessions/spec.md`

## Summary

Deliver multi-book support with book-scoped requirements + drafts, plus session history and a clear “View vs Continue” workflow.

- **Multi-book**: Users can create/select books; drafts and requirements remain isolated per book.
- **History**: Each book exposes a list of past sessions and a read-only transcript view.
- **Continue**: Users can continue from any past session by starting a *new* live session seeded from the **current** book requirements and **current** draft.

Storage is file-based: book files are the durable truth; session logs provide replay and continuity.

## Technical Context

**Language/Version**: TypeScript (repo uses TypeScript 5.x) + Node.js 18+
**Primary Dependencies**:

- GitHub Copilot SDK (`@github/copilot-sdk`)
- Backend: Express (+ CORS), Server-Sent Events (SSE)
- Frontend: React + Vite + TanStack Router + Tailwind

**Storage**:

- Filesystem under `books/<bookId>/`
- Session history as append-only per-session event logs (JSONL) + session metadata

**Testing**:

- Typecheck: `tsc --noEmit`
- Manual smoke tests for core flows (create book, start session, view history, continue)
- Add minimal automated coverage where high-risk (path validation, book/session scoping)

**Target Platform**: Local development on Linux/macOS/Windows (Node-based)
**Project Type**: Monorepo-style local app: CLI + backend server + web UI
**Performance Goals**:

- UI streams output smoothly (SSE)
- Reload/reconnect can replay history without user confusion

**Constraints**:

- Requirements-first: `books/<bookId>/requirements/` is the source of truth
- Preserve user edits to draft files unless explicitly asked to rewrite
- Safe file access: prevent reading/writing outside the selected book

**Scale/Scope**:

- Multiple books on the same machine
- Multiple concurrent sessions (e.g., separate browser tabs) without cross-book contamination

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature passes the constitution gates:

1) **Requirements-first**

- Sessions must read and update book state via `books/<bookId>/requirements/` and `books/<bookId>/book/`.
- “Continue” is seeded from the current files, not from a hidden, stale session-only memory.

2) **Small, reviewable chunks**

- Session output remains incremental (chapter/section/paragraph sized), not “write the whole book”.
- Session history exists so users can review what happened and course-correct.

3) **Human-in-the-loop, always**

- Users can edit draft files directly.
- Tooling must avoid overwriting user edits unless explicitly instructed.

4) **Ask when uncertain**

- If requirements are missing/conflicting, the assistant asks 1–4 targeted questions.
- Answers should be recorded back into requirements (typically `requirements/feedback.md`).

Re-check after Phase 1 design: still passes (no new conventions required beyond documenting any new folder/files introduced).

## Project Structure

### Documentation (this feature)

```text
specs/001-multi-book-sessions/
├── spec.md              # Feature spec
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── openapi.yaml     # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
```text
src/
├── cli.ts
├── interactive.ts
├── legacyMigration.ts
├── bookLayout.ts
├── server/
│   ├── index.ts
│   ├── sessionManager.ts
│   ├── sse.ts
│   └── tools/
└── tools/

apps/
└── web/
    ├── vite.config.ts
    └── src/

books/
└── <bookId>/
    ├── requirements/
    ├── book/
    └── .sessions/
```

**Structure Decision**: Use the existing CLI + backend under `src/` and the web UI under `apps/web/`. The feature adds and relies on the `books/<bookId>/...` folder layout.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations required for this feature.

## Phased Plan

### Phase 0: Research (complete)

- Record decisions and tradeoffs in `research.md`.

### Phase 1: Design (complete)

- Define entities/relationships in `data-model.md`.
- Define API contracts in `contracts/openapi.yaml`.
- Provide a runnable guide in `quickstart.md`.

### Phase 2: Implementation plan (next)

Implementation should follow these steps (in small, reviewable chunks):

1. Ensure multi-book layout helpers validate `bookId` and generate book-scoped paths.
2. Ensure all server routes are book-scoped for listing sessions, viewing transcripts, and continuing.
3. Ensure file tools are scoped to the selected book and block unsafe paths.
4. Ensure session history is durable and replayable:
  - append-only events
  - corruption-tolerant replay
  - (optional) stable per-event ids for resume
5. Ensure the web UI clearly separates:
  - chat (user prompts + questions)
  - rolling output (assistant streaming)
  - session list (View vs Continue)
6. Add minimal automated tests for the highest-risk areas:
  - safe path resolution (including symlink escape attempts)
  - book/session scoping
