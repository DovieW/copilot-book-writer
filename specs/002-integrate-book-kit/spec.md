# Feature Specification: Book-kit Frontend Integration

**Feature Branch**: `002-integrate-book-kit`
**Created**: 2026-01-25
**Status**: Draft
**Input**: User description: "I've added a project called book-kit to this workspace. Please implement/initialize it (shared), and make copilot-book-writer a frontend for book-kit. On the frontend we need a dropdown for switching modes/agents."

## Clarifications

### Session 2026-01-25

- Q: When a user changes the agent/mode dropdown, should it apply immediately to the current session, or only when starting a new session? → A: Applies immediately to the current session.
- Q: Where is the source-of-truth list of available agents/modes? → A: BookKit is the source-of-truth and the UI should display what BookKit reports.
- Q: Who runs the BookKit “install/upgrade agents” step? → A: The project maintainer/repo setup handles it; end users do not run upgrades from the UI.
- Q: Should the UI support running without BookKit at all (a degraded/offline mode)? → A: No; BookKit is required.
- Q: How should copilot-book-writer talk to BookKit at runtime? → A: BookKit runs as a local HTTP service and the UI calls it over HTTP.
- Q: Should the system store/show which agent/mode was used in session history? → A: No; do not store it (selection only affects behavior live).
- Q: Is this intended to be single-user/local-only (no login), or multi-user (requires auth)? → A: Local-only, no auth.
- Q: If the user changes the agent/mode dropdown while a response is still being generated/streamed, what should happen? → A: Let the current response finish; the new selection applies to the next message.
- Q: Should copilot-book-writer automatically start the local BookKit HTTP service when you run the app, or should BookKit be started separately? → A: Auto-start BookKit.

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Start writing with a selected agent/mode (Priority: P1)

As a writer, I want to pick a writing “mode/agent” from a dropdown and start a writing session, so I can get help that matches what I’m trying to do (drafting vs editing vs brainstorming).

**Why this priority**: This is the core value: selecting an agent/mode should immediately change the kind of help the user gets.

**Independent Test**: With the app running, pick an agent/mode, start a session, send one prompt, and confirm the response is returned successfully and that the selected agent/mode is used for the request.

**Acceptance Scenarios**:

1. **Given** the app is open and at least one agent/mode is available, **When** I choose an agent/mode and start a session, **Then** the session starts successfully and uses the chosen agent/mode for my next message.
2. **Given** I started a session and selected agent/mode A, **When** I select agent/mode B and start another session, **Then** the second session starts successfully and uses B for my next message (without overwriting the first session).

---

### User Story 2 - Switch agent/mode without losing work (Priority: P2)

As a writer, I want to switch to a different agent/mode from the dropdown without losing my book’s files or history, so I can change strategies as I go.

**Why this priority**: People naturally “bounce” between drafting, revising, and planning. Switching should feel safe.

**Independent Test**: Create a book and a session, then switch agent/mode and confirm the next interaction uses the new agent/mode while existing files and session history remain intact.

**Acceptance Scenarios**:

1. **Given** I have an existing book with files and session history, **When** I switch the selected agent/mode, **Then** my files and history remain visible and unchanged.
2. **Given** I switch from agent/mode A to B, **When** I send my next message in the current session, **Then** the system uses agent/mode B for that message.
3. **Given** the dropdown is set to agent/mode B, **When** I start a new session, **Then** the new session uses agent/mode B for my next message.

---

### User Story 3 - One shared setup for book-kit + UI (Priority: P3)

As a developer (or power user), I want a simple “shared initialization” experience so the UI can use book-kit without manual wiring, so I can clone the repo/workspace and get productive quickly.

**Why this priority**: This reduces setup friction and prevents “it works on my machine” issues.

**Independent Test**: Starting from a clean checkout, follow documented setup steps and verify the UI can perform at least one book-kit powered action (start a session and get a response).

**Acceptance Scenarios**:

1. **Given** a fresh clone of the repository/workspace, **When** I follow the setup instructions, **Then** I can launch the UI and it can connect to book-kit successfully.
2. **Given** book-kit is unavailable, **When** I try to start a session, **Then** I see a clear error and a suggested next step (without the app crashing).

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

- No agents/modes are available (empty list).
- Selected agent/mode becomes unavailable after selection (removed/disabled).
- Switching agent/mode while a response is still being generated/streamed.
- book-kit cannot be reached (not running, crashed, wrong address).
- book-kit returns an error for a specific request.
- The UI and book-kit are incompatible versions.

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: The system MUST treat book-kit as the “engine” used to perform writing actions (e.g., starting a session and generating responses), rather than duplicating that logic inside the UI.
- **FR-002**: The UI MUST present a dropdown that lists available agents/modes with human-friendly names.
- **FR-003**: The user MUST be able to choose an agent/mode before starting a session.
- **FR-004**: The system MUST use the currently selected agent/mode to handle the user’s next message.
- **FR-005**: The user MUST be able to change the selected agent/mode at any time.
- **FR-006**: If the selected agent/mode is unavailable, the system MUST prevent starting a session with it and MUST explain why (and how to fix it).
- **FR-007**: The system MUST provide clear, non-technical error messages when book-kit is not reachable.
- **FR-008**: The system MUST NOT lose or overwrite book files or session history when switching agents/modes.
- **FR-009**: The system MUST have a documented “shared initialization” workflow so new users can set up and run the UI + book-kit with minimal steps.
- **FR-010**: The system MUST treat book-kit as the source-of-truth for which agents/modes are available.
- **FR-011**: Installing or upgrading agents/modes MUST be handled outside the UI (for example by the project/repo setup maintained by the maintainer), and the UI MUST only display what book-kit reports as available.
- **FR-012**: The system MUST communicate with book-kit via a local HTTP service boundary.
- **FR-013**: If the agent/mode selection changes while a response is generating, the current response MUST continue and the new selection MUST apply to the next user message.
- **FR-014**: The system MUST provide a shared initialization/run workflow where starting the app also starts the local book-kit HTTP service.

### Key Entities *(include if feature involves data)*

- **Agent/Mode**: A selectable “personality” or workflow style (id, display name, short description, availability status).
- **Book**: A writing project the user is working on (id/name, current files, last updated time).
- **Writing Session**: A history record of a conversation used to produce or edit content (id, created time, associated book, chosen agent/mode, messages/transcript).
- **Writing Session**: A history record of a conversation used to produce or edit content (id, created time, associated book, messages/transcript).
- **Connection Status**: Whether the UI can currently communicate with book-kit (connected/disconnected + last error).

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: A new user can go from “fresh checkout” to “first successful response” in $\le 10$ minutes following the documented setup steps.
- **SC-002**: Users can start a session with a chosen agent/mode in $\le 30$ seconds (excluding time spent thinking/typing).
- **SC-003**: Switching the selected agent/mode never deletes or overwrites book files or existing session history (0 data-loss incidents in testing).
- **SC-004**: In usability testing, at least 90% of users can correctly explain which agent/mode is active and how to change it.

## Assumptions

- “Agent” and “mode” are treated as the same concept for the purpose of selection (a single dropdown).
- The system will support at least a small default set of agents/modes (even if only one at first).
- book-kit is required for the product to work; the UI does not need to support a standalone/offline mode.
- book-kit runs as a local HTTP service for development and normal usage.
- The system is local-only and assumes a single user (no login/auth).
