# Implementation Plan: Integrate BookKit Agents

**Branch**: `002-integrate-book-kit` | **Date**: 2026-01-25 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/002-integrate-book-kit/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Make `copilot-book-writer` act as a UI/frontend that can use BookKit’s “agent modes” (prompt files) via a dropdown.

Key outcomes:

- The web UI shows a dropdown of available BookKit agents/modes.
- The selected agent/mode affects the *next* message immediately (even mid-session), but is **not persisted** into session history.
- BookKit is treated as the source-of-truth for which agents exist; end users do not install/upgrade agents from the UI.
- Setup is easy: the repo includes the agent prompt files (“vendored” from BookKit) and the normal `npm run dev` flow works.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Node.js >= 18, TypeScript 5.x (backend + frontend)

**Primary Dependencies**: Express, React, Vite, `@github/copilot-sdk`, zod

- Backend: Express, CORS, dotenv, zod, `@github/copilot-sdk`
- Frontend: React, TanStack Router, Tailwind tooling

**Storage**: Filesystem (books + sessions)

- Filesystem (existing): `books/<bookId>/...` for requirements/draft and `.sessions/` for session logs
- Agent prompt files: vendored into this repo under an `agents/` folder (see Research)

**Testing**: `npm run typecheck` + manual quickstart (add automated tests later)

- Existing: `npm run typecheck`
- Add for this feature: lightweight integration coverage (at minimum, manual quickstart + optional super-basic Node-level tests if already used in repo)

**Target Platform**: Local development (Linux/macOS/Windows), single-user
**Project Type**: Web application (Express backend + React frontend)

**Performance Goals**: Interactive UX; streaming responses via SSE should remain responsive.

**Constraints**:

- Local-only; no auth
- Must not break existing session/history flows
- Must remain “human in the loop” (preserve user edits and requirements-first)

**Scale/Scope**: Single user, small number of books and sessions (tens/hundreds).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution principles (from `.specify/memory/constitution.md`) and how this feature respects them:

1) **Requirements-first**

- This feature does not change the truth source (`books/<bookId>/requirements/`).
- Agent modes are prompts that help create/edit content, but requirements remain the source of truth.

2) **Small, reviewable chunks**

- No change to the incremental writing model; UI just selects which prompt style guides the next request.

3) **Human-in-the-loop, always**

- The UI will continue to expose draft content and preserve user edits.
- No automation that overwrites large parts of the manuscript without an explicit user action.

4) **Ask when uncertain**

- The runtime system can still ask questions (existing “ask-questions” tool flow).
- Spec clarifications are recorded in `spec.md`; future unknowns become requirements.

Governance:

- If we introduce a new convention (e.g., `agents/bookkit/` vendoring), document it (docs update planned).

✅ Gate result: PASS (no violations required).

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
src/
├── server/
│   ├── index.ts                # Express API + SSE
│   ├── sessionManager.ts       # Copilot sessions + persistence
│   └── ...
├── tools/
├── cli.ts
└── ...

apps/
└── web/
  ├── src/
  │   ├── App.tsx
  │   ├── api.ts              # HTTP calls to backend
  │   └── ...
  └── ...

agents/
└── bookkit/
  └── ...                     # Vendored BookKit agent prompt files (data only)

specs/
└── 002-integrate-book-kit/
  └── ...                     # This feature’s docs
```

**Structure Decision**: Web application (existing Express backend + React frontend). This feature adds a small “agent catalog” slice spanning backend (`src/server`) and frontend (`apps/web/src`).

## Phases & Deliverables

### Phase 0 — Research (output: `research.md`)

Decide (and document):

- How to vendor BookKit agents into this repo (chosen: vendor only prompt files).
- What the “agent mode” contract looks like between UI and backend.
- How to handle versioning / updates (maintainer-controlled sync script, not end-user).

### Phase 1 — Design (outputs: `data-model.md`, `contracts/`, `quickstart.md`)

- Define the minimal data model for “AgentMode” and status.
- Add an API contract for listing agent modes and for sending messages with a chosen agent.
- Write a quickstart that validates the UX end-to-end.
- Update agent context file via `.specify/scripts/bash/update-agent-context.sh copilot`.

### Phase 2 — Execution planning (output: `tasks.md` via `/speckit.tasks`)

Break the work into small, reviewable steps:

- Backend: agent catalog loader + `/api/bookkit/agents` endpoint.
- Frontend: dropdown UI + include `agentId` on message send.
- Docs: describe `agents/bookkit/` vendoring and quickstart.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
