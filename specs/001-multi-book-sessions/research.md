# Research: Multi-book Sessions & History

**Feature**: [Multi-book Sessions & History](./spec.md)
**Date**: 2026-01-25

This document records key implementation decisions and tradeoffs surfaced during research. It is written to support the design artifacts (`data-model.md`, `contracts/`, `quickstart.md`) and the implementation plan (`plan.md`).

## Decision 1: Session history persistence format = per-session append-only JSONL

**Decision**: Store each session’s history as an append-only JSONL event log per book/session.

**Rationale**:

- Fits the product goal: session history is primarily for *replay (“View”)* and basic continuity.
- Simple, inspectable, and resilient: if the process crashes mid-write, typically only the last line is affected.
- Matches the “requirements-first” constitution: the *book files* remain the source of truth; session logs are historical context.

**Operational notes (baseline hardening)**:

- Add a monotonic `seq` per session event to enable dedupe and gap detection.
- Prefer a single-writer approach per session (queue or stream) to avoid interleaved writes.
- Support replay from a cursor (SSE `Last-Event-ID`) to avoid replaying entire logs on reconnect.
- Tolerate malformed/truncated lines during replay; optionally truncate to last good line on repair.

**Alternatives considered**:

- **SQLite**: better querying and concurrency handling, but adds schema/migrations and is heavier than needed for an MVP.
- **Snapshot-only JSON**: simple but loses detailed replay (“View”) and makes auditing decisions harder.
- **Hybrid (JSONL + SQLite index)**: powerful for search/analytics, but too complex for this feature’s scope.

## Decision 2: “Continue” semantics = start a new live session seeded from durable book state

**Decision**: “Continue” starts a *new* live session linked to an older one, seeded from the current book requirements + current book draft (and optionally a compact history summary).

**Rationale**:

- Copilot SDK sessions can be resumed by ID, but resuming depends on external session storage and still requires re-attaching tool handlers.
- Users should not be blocked if the original live session is gone. Durable truth is in book files.
- Makes the UX easy to explain:
  - **View** = read-only transcript
  - **Continue** = new run using current files

**Alternatives considered**:

- **“Resume exact chat”** (optional future): resume the same Copilot SDK session by `sessionId`.
  - Pros: best “memory fidelity” for long conversations.
  - Cons: can diverge from current files and is harder to guarantee across environments.

## Decision 3: Isolation model = book-scoped roots + strict path validation

**Decision**: All file operations (tooling and API) are restricted to a selected book’s directories using an allowlist of roots, plus strict path validation.

**Rationale**:

- Prevents cross-book contamination and prevents reading/writing outside the book area.
- Keeps the model’s capabilities narrowly scoped, aligning with safety and predictability.

**Hardening notes**:

- Use canonical-path checks (`realpath`) to prevent symlink escapes.
- Prefer capability-style APIs (e.g., file name within a known subfolder) over arbitrary user-supplied paths.
- For book-scoped routes, validate that the requested `sessionId` belongs to the requested `bookId` (IDOR-style relationship checks).

## Decision 4: Handling very large books = baseline now, summarization later

**Decision**: Implement a simple baseline approach for large books (may include full current draft during continuation), and plan a future upgrade to summarization/checkpoints.

**Rationale**:

- Keeps this feature small and deliverable.
- Still supports the core flows (multi-book + history + continue).

**Alternatives considered**:

- Structured “Book Memory” file (`requirements/memory.md` or `memory.json`) updated each session.
- Periodic checkpoints/snapshots to speed up replay and reduce seed size.

## Open Questions

None required for this plan. Future enhancements (explicitly out of scope) include retention policies, collaboration, and advanced summarization.
