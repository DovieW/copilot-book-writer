---

description: "Task list for implementing Multi-book Sessions & History"
---

# Tasks: Multi-book Sessions & History

**Input**: Design documents from `specs/001-multi-book-sessions/`

**Prerequisites**:

- `specs/001-multi-book-sessions/plan.md`
- `specs/001-multi-book-sessions/spec.md`
- `specs/001-multi-book-sessions/research.md`
- `specs/001-multi-book-sessions/data-model.md`
- `specs/001-multi-book-sessions/contracts/openapi.yaml`
- `specs/001-multi-book-sessions/quickstart.md`

**Tests**: Not requested in the feature specification, so no test tasks are included.

## Format: `- [ ] T### [P?] [US?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[US1]/[US2]/[US3]**: User story mapping (from `spec.md`)
- Every task includes at least one concrete file path

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Small repo-level setup needed before feature work

- [x] T001 Update ignore rules for local book data in `/home/dovie/repos/copilot-book-writer/.gitignore`
- [x] T002 [P] Add a short multi-book note to `/home/dovie/repos/copilot-book-writer/docs/WORKFLOW.md` (explain `books/<bookId>/...` layout)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared building blocks that all user stories depend on

- [x] T003 Implement safe book id + layout helpers in `/home/dovie/repos/copilot-book-writer/src/bookLayout.ts`
- [x] T004 Implement legacy migration into `books/default/` in `/home/dovie/repos/copilot-book-writer/src/legacyMigration.ts`
- [x] T005 Define shared server DTOs/events for books/sessions in `/home/dovie/repos/copilot-book-writer/src/server/types.ts`
- [x] T006 Implement book-scoped session persistence (meta + JSONL event log) in `/home/dovie/repos/copilot-book-writer/src/server/sessionManager.ts`
- [x] T007 Harden file sandboxing by enforcing book-scoped allowed roots in `/home/dovie/repos/copilot-book-writer/src/tools/fileTools.ts`
- [x] T008 Harden server tool wrappers to emit persisted events in `/home/dovie/repos/copilot-book-writer/src/server/tools/fileToolsWithEvents.ts`
- [x] T009 Ensure SSE helpers support replay + live streaming in `/home/dovie/repos/copilot-book-writer/src/server/sse.ts`

**Checkpoint**: Foundation ready (safe book layout, safe file access, durable session log primitives)

---

## Phase 3: User Story 1 - Start writing in a chosen book (Priority: P1) 🎯 MVP

**Goal**: Users can create/select a book and start a session, with all changes isolated to that book.

**Independent Test**: Create two books, start a session in each, and confirm requirements/draft writes only affect the selected book.

### Implementation

- [x] T010 [US1] Add book list + create endpoints in `/home/dovie/repos/copilot-book-writer/src/server/index.ts` (`GET /api/books`, `POST /api/books`)
- [x] T011 [US1] Add book details endpoint in `/home/dovie/repos/copilot-book-writer/src/server/index.ts` (`GET /api/books/:bookId`)
- [x] T012 [US1] Add “start session for book” endpoint in `/home/dovie/repos/copilot-book-writer/src/server/index.ts` (`POST /api/books/:bookId/sessions/start`)
- [x] T013 [P] [US1] Add client API wrappers for books + start-session in `/home/dovie/repos/copilot-book-writer/apps/web/src/api.ts`
- [x] T014 [P] [US1] Implement book create/select + mode selection UI flow in `/home/dovie/repos/copilot-book-writer/apps/web/src/App.tsx`
- [x] T015 [US1] Ensure CLI supports selecting a book (flag + prompt) in `/home/dovie/repos/copilot-book-writer/src/cli.ts` and `/home/dovie/repos/copilot-book-writer/src/interactive.ts`
- [x] T016 [US1] Call legacy migration on startup (CLI + server) in `/home/dovie/repos/copilot-book-writer/src/cli.ts` and `/home/dovie/repos/copilot-book-writer/src/server/index.ts`

**Checkpoint**: User Story 1 is demoable on its own.

---

## Phase 4: User Story 2 - View session history for a book (Priority: P2)

**Goal**: Users can list sessions for a book and view a prior session transcript without starting a new live session.

**Independent Test**: Run a session, reload, then view the session transcript from the book’s history list.

### Implementation

- [x] T017 [US2] Add “list sessions for book” endpoint in `/home/dovie/repos/copilot-book-writer/src/server/index.ts` (`GET /api/books/:bookId/sessions`)
- [x] T018 [US2] Add SSE “events” endpoint with stored replay in `/home/dovie/repos/copilot-book-writer/src/server/index.ts` (`GET /api/books/:bookId/sessions/:sessionId/events`)
- [x] T019 [P] [US2] Add client API wrappers for listing sessions + viewing transcripts in `/home/dovie/repos/copilot-book-writer/apps/web/src/api.ts`
- [x] T020 [P] [US2] Implement session history UI (list + view) in `/home/dovie/repos/copilot-book-writer/apps/web/src/App.tsx`
- [x] T021 [US2] Ensure session metadata includes timestamps for correct sorting in `/home/dovie/repos/copilot-book-writer/src/server/sessionManager.ts`

**Checkpoint**: User Story 2 works independently (history list + view-only transcript).

---

## Phase 5: User Story 3 - Continue work from any prior session (Priority: P3)

**Goal**: Users can continue from any prior session by starting a NEW session that is seeded from current requirements + current draft.

**Independent Test**: Finish a session, choose Continue, verify a new session starts and is linked to the prior session.

### Implementation

- [x] T022 [US3] Add “continue session” endpoint in `/home/dovie/repos/copilot-book-writer/src/server/index.ts` (`POST /api/books/:bookId/sessions/:sessionId/continue`)
- [x] T023 [US3] Implement continue-from-session behavior and traceability in `/home/dovie/repos/copilot-book-writer/src/server/sessionManager.ts` (record `continuedFromSessionId`)
- [x] T024 [US3] Ensure seeding uses CURRENT files (requirements + draft) in `/home/dovie/repos/copilot-book-writer/src/server/sessionManager.ts`
- [x] T025 [P] [US3] Add client API wrapper for continue-from-session in `/home/dovie/repos/copilot-book-writer/apps/web/src/api.ts`
- [x] T026 [P] [US3] Add “Continue” action in the session history UI in `/home/dovie/repos/copilot-book-writer/apps/web/src/App.tsx`

**Checkpoint**: All 3 user stories work and remain independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Make the feature safer, clearer, and easier to validate

- [x] T027 [P] Tighten filename/path validation for book file read endpoints in `/home/dovie/repos/copilot-book-writer/src/server/index.ts`
- [x] T028 [P] Add clearer user-facing error messages for invalid book names and missing sessions in `/home/dovie/repos/copilot-book-writer/src/server/index.ts`
- [x] T029 [P] Update quickstart to include “View vs Continue” explanation in `/home/dovie/repos/copilot-book-writer/specs/001-multi-book-sessions/quickstart.md`
- [ ] T030 Validate quickstart steps end-to-end and record any corrections in `/home/dovie/repos/copilot-book-writer/specs/001-multi-book-sessions/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** → blocks Phase 2
- **Phase 2 (Foundational)** → blocks all user stories
- **Phase 3 (US1)** can start after Foundational
- **Phase 4 (US2)** can start after Foundational (but is more useful once at least one session can be created via US1)
- **Phase 5 (US3)** can start after Foundational (but requires sessions to exist, so practically depends on US1)
- **Phase 6 (Polish)** depends on desired user stories being complete

### User Story Dependencies (graph)

- **US1 (P1)** → enables meaningful work for US2 and US3
- **US2 (P2)** depends on US1 (needs sessions to exist)
- **US3 (P3)** depends on US1 (needs a prior session to continue from)

---

## Parallel Execution Examples

### US1 parallel opportunities

Tasks **T013** (`/apps/web/src/api.ts`) and **T014** (`/apps/web/src/App.tsx`) can be done in parallel.

### US2 parallel opportunities

Tasks **T019** (`/apps/web/src/api.ts`) and **T020** (`/apps/web/src/App.tsx`) can be done in parallel.

### US3 parallel opportunities

Tasks **T025** (`/apps/web/src/api.ts`) and **T026** (`/apps/web/src/App.tsx`) can be done in parallel.

---

## Implementation Strategy

### MVP scope (recommended)

Complete **Phase 1 → Phase 2 → Phase 3 (US1)**, then stop and validate US1 independently.

### Incremental delivery

- Add **US2** next to make sessions visible and reviewable.
- Add **US3** last to enable restarting work from any prior session.
