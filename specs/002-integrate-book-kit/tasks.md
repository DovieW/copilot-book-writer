---

description: "Task list for implementing BookKit agent dropdown"
---

# Tasks: Integrate BookKit Agents

**Input**: Design documents from `/specs/002-integrate-book-kit/`

- `plan.md` (required)
- `spec.md` (required)
- `research.md`
- `data-model.md`
- `contracts/openapi.yaml`
- `quickstart.md`

**Tests**: No automated tests were explicitly requested in the spec. This task list uses the manual verification steps in `quickstart.md` as the primary acceptance gate.

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Create `agents/bookkit/` directory + add `agents/bookkit/README.md` explaining vendoring and update process
- [x] T002 [P] Vendor BookKit prompt files into `agents/bookkit/` from the BookKit repo (source: `../book-kit/agents/` in the workspace, destination: `agents/bookkit/`)
- [x] T003 [P] Add `.gitignore` rules if needed for any generated/synced artifacts (repo root `.gitignore`)
- [x] T004 [P] Add/confirm a dev note in `README.md` or `docs/WORKFLOW.md` describing “agent dropdown uses prompts from `agents/bookkit/`”

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T005 [P] Create shared types for BookKit agent catalog in `src/server/bookkit/types.ts`
- [x] T006 Create prompt discovery + parsing utility in `src/server/bookkit/agentCatalog.ts` (scan `agents/bookkit/**`, derive `id`, `displayName`, optional `description`, and `promptPath`)
- [x] T007 Add BookKit status endpoint `GET /api/bookkit/status` in `src/server/index.ts`
- [x] T008 Add BookKit agents endpoint `GET /api/bookkit/agents` in `src/server/index.ts` using `agentCatalog.ts`
- [x] T009 Extend message API input validation to accept optional `agentId` in `src/server/index.ts` for `POST /api/sessions/:id/messages`
- [x] T010 Extend `SessionManager.sendMessage()` signature to accept optional `agentId` and inject the selected prompt text for that message only in `src/server/sessionManager.ts`
- [x] T011 Add server-side error handling for unknown `agentId` (return 400 with a friendly error) in `src/server/index.ts`
- [x] T012 [P] Add frontend API helpers `getBookKitStatus()` and `listBookKitAgents()` in `apps/web/src/api.ts`

**Checkpoint**: Backend can list agents and accept `agentId` on message send; frontend can fetch the agent list.

---

## Phase 3: User Story 1 (P1) 🎯 MVP — Start writing with a selected agent/mode

**Goal**: Let the user pick an agent/mode from a dropdown and have it affect the next message.

**Independent Test**: Follow `spec.md` User Story 1 independent test and `quickstart.md` sections 3–7.

- [x] T013 [P] [US1] Add BookKit agent dropdown state + UI in `apps/web/src/App.tsx` (load agents at startup and show selection in Start card)
- [x] T014 [US1] Wire selected agent id through `sendMessage()` calls in `apps/web/src/App.tsx` → `apps/web/src/api.ts`
- [x] T015 [P] [US1] Update `apps/web/src/api.ts` `sendMessage()` to accept optional `agentId` and send it in the JSON body
- [x] T016 [US1] Show a clear error state in the UI if `/api/bookkit/status` is not ok (in `apps/web/src/App.tsx`)

**Checkpoint**: You can start a session, select an agent, send a prompt, and the response behavior reflects the selected agent.

---

## Phase 4: User Story 2 (P2) — Switch agent/mode without losing work

**Goal**: Switching the dropdown applies immediately to the next message without affecting files/history.

**Independent Test**: Follow `spec.md` User Story 2 independent test and `quickstart.md` step 8.

- [x] T017 [US2] Ensure agent selection applies immediately for the next message within the same session (UI-level behavior) in `apps/web/src/App.tsx`
- [x] T018 [US2] Implement “mid-stream switching” behavior: do not cancel current stream; apply selection to next message in `apps/web/src/App.tsx`
- [x] T019 [US2] Ensure agent selection is not stored in session history metadata or transcript logs (confirm + adjust any accidental persistence) in `src/server/sessionManager.ts`

**Checkpoint**: Switching agent while streaming doesn’t break the current response; the next message uses the new agent.

---

## Phase 5: User Story 3 (P3) — One shared setup for book-kit + UI

**Goal**: New users can run the repo and get the agent dropdown working with minimal steps.

**Independent Test**: Follow `spec.md` User Story 3 independent test and the full `quickstart.md`.

- [x] T020 [P] [US3] Document how `agents/bookkit/` is maintained (maintainer-only updates) in `agents/bookkit/README.md`
- [x] T021 [P] [US3] Ensure `npm run dev` starts everything needed (backend + web) and `quickstart.md` matches reality; update `specs/002-integrate-book-kit/quickstart.md` if needed
- [x] T022 [US3] Add a friendly, non-technical UI message if the agent catalog is empty (no agents found) in `apps/web/src/App.tsx`

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T023 [P] Tighten agent filename/path validation and prevent directory traversal in `src/server/bookkit/agentCatalog.ts`
- [x] T024 [P] Add lightweight caching for agent catalog (e.g., cache for 5 seconds) in `src/server/bookkit/agentCatalog.ts`
- [x] T025 Update OpenAPI contract if implementation differs from `specs/002-integrate-book-kit/contracts/openapi.yaml`
- [ ] T026 Run the full manual validation in `specs/002-integrate-book-kit/quickstart.md` and record any fixes

---

## Dependencies & Execution Order

### Dependency graph (story completion order)

```text
Phase 1 (Setup) ─┐
				├─> Phase 2 (Foundational) ─> US1 (MVP) ─> US2 ─┐
				│                                              ├─> Phase 6 (Polish)
				└─────────────────────────────> US3 ───────────┘
```

### Phase Dependencies

- Phase 1 (Setup) → Phase 2 (Foundational) → User stories (Phase 3–5) → Phase 6 (Polish)

### User Story Dependencies

- **US1** depends on Phase 2 (needs endpoints + agent injection + frontend API).
- **US2** depends on US1 (needs dropdown + message send wired).
- **US3** depends on Phase 1 + Phase 2 (needs vendored prompts + stable endpoints).

---

## Parallel Execution Examples

### US1 parallelizable tasks

- [P] T012 (frontend API helpers) can be done in parallel with backend tasks T005–T011.
- [P] T013 (`apps/web/src/App.tsx` dropdown UI) and T015 (`apps/web/src/api.ts` sendMessage signature) can be done in parallel; T014 stitches them together.

### US3 parallelizable tasks

- [P] T001, T002, T004 can be parallelized (docs + vendoring + notes) while Phase 2 backend work proceeds.
- [P] T020 and T021 can be done in parallel (different docs files).

---

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 + Phase 2
2. Complete US1 tasks T013–T016
3. Validate with `quickstart.md`

### Incremental delivery

- Add US2 switching semantics
- Add US3 documentation and “new clone” friendliness
- Finish polish tasks
