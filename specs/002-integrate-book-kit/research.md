# Research: Integrate BookKit Agents

**Feature**: `002-integrate-book-kit`
**Date**: 2026-01-25

## Decision 1: How BookKit is included

**Decision**: Vendor only BookKit agent prompt files into this repo (not the full BookKit repo).

**Rationale**:

- Keeps the "clone one repo and run" story simple.
- Avoids coupling runtime behavior to a sibling repo path.
- Maintainers can update prompts by re-syncing from BookKit, but end users don’t need to do any install/upgrade work.

**Alternatives considered**:

- Git submodule of the full BookKit repo (easy updates, but adds submodule friction and still pulls the whole repo).
- Require `../book-kit` to exist (works in a multi-repo workspace, but breaks for most clones).

## Decision 2: What an “agent/mode” is

**Decision**: An agent/mode is a prompt file the UI can select (id + display name + optional description). The backend returns the catalog and the frontend uses it to populate a dropdown.

**Rationale**:

- Matches how BookKit describes “agent modes” (prompts).
- Works with the existing Copilot SDK session architecture: we can inject the selected prompt into the *next* message.

**Alternatives considered**:

- Treat agent/mode as a server-side persistent setting per session (rejected: user explicitly doesn’t want this stored/shown in history).

## Decision 3: How selection affects requests

**Decision**:

- Switching selection applies immediately for the *next* message.
- If switching happens while a response is streaming, the current response continues; the new selection applies to the next message.

**Rationale**:

- Least surprising and avoids cancellation complexity.

## Decision 4: Persistence

**Decision**: Do not persist or show which agent/mode was used in session history.

**Rationale**:

- User preference.
- Keeps session logs focused on conversation, not configuration.

## Decision 5: Integration boundary

**Decision**: The web UI talks to the local backend (existing Express server) over HTTP. The backend acts as the “BookKit agent catalog service” by serving vendored prompt metadata.

**Rationale**:

- Fits existing architecture (UI already calls the backend).
- Avoids adding a new Python HTTP server that BookKit does not currently provide.

## Open questions (for implementation, not spec)

- Where exactly to store vendored prompts (proposed: `agents/bookkit/**`).
- How to derive human-friendly display names (frontmatter in markdown? filename heuristics?)
- Whether prompts should be short snippets (system preamble) or full instruction blocks.
