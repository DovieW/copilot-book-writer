# Feature Specification: Multi-book Sessions & History

**Feature Branch**: `[001-multi-book-sessions]`
**Created**: 2026-01-25
**Status**: Draft
**Input**: User description: "Support multiple books with per-book folders (requirements + draft), session history, and the ability to view past sessions and continue work by starting a new session seeded from existing requirements and book text. Web UI should let users create/select a book, browse sessions, view transcripts, and continue from any session. CLI should also prompt for mode and book name."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start writing in a chosen book (Priority: P1)

As a user, I want to pick (or create) a book and start a writing session so that everything I do stays separated from other books.

**Why this priority**: This is the core value: working on a specific book without mixing requirements or draft content between books.

**Independent Test**: Can be fully tested by creating two books and verifying writing changes only affect the selected book.

**Acceptance Scenarios**:

1. **Given** I have no books yet, **When** I enter a new book name and start, **Then** the system creates that book and begins an interactive writing flow for that book.
2. **Given** I have two books, **When** I start a session in Book A and then switch to Book B, **Then** Book B shows its own draft/chapters and requirements, not Book A’s.
3. **Given** I start a session, **When** the assistant writes or updates constraints, **Then** only the selected book’s draft and requirements are changed.

---

### User Story 2 - View session history for a book (Priority: P2)

As a user, I want to see past sessions for a book and review what happened so that I can understand decisions and progress over time.

**Why this priority**: Users will iterate; the history provides a “paper trail” for decisions, questions, and progress.

**Independent Test**: Can be tested by running a session, then returning later and confirming the session appears in the book’s history and can be viewed.

**Acceptance Scenarios**:

1. **Given** a book has prior sessions, **When** I open the book, **Then** I can see a list of sessions (most recent first) with a timestamp.
2. **Given** I select a prior session, **When** I choose “View”, **Then** I can review the session transcript/progress without starting a new live session.

---

### User Story 3 - Continue work from any prior session (Priority: P3)

As a user, I want to “continue” from an earlier session so that I can keep working even if the previous live session is no longer running.

**Why this priority**: Users shouldn’t be tied to a single live session. Requirements and the book draft are the durable truth; sessions are safe to restart.

**Independent Test**: Can be tested by completing one session, ending it, then choosing “Continue” and verifying a new session starts with the same book context and continues writing correctly.

**Acceptance Scenarios**:

1. **Given** I have a prior session for a book, **When** I choose “Continue” from that session, **Then** the system starts a new live session that is aware of the current requirements and book content.
2. **Given** the previous live session is no longer running, **When** I choose “Continue”, **Then** I can still start a new session successfully and keep writing.
3. **Given** I continue from Session A, **When** I check the session history, **Then** the new session is recorded and shows that it was continued from Session A.

---

### Edge Cases

- Invalid or empty book name (e.g., only symbols, extremely long name)
- Two books with very similar names (should not cause confusion or accidental overwrites)
- Switching books while a live session is running (should not mix content)
- Reloading the page mid-session (should not lose the ability to view prior output)
- Continuing from a session when the underlying live session is offline
- Very large books (the system must avoid becoming unusable when a lot of text exists)
- Corrupted or partially written session history data (system should degrade gracefully)

## Requirements *(mandatory)*

### Scope

**In scope**:

- Create and select multiple books
- Keep each book’s requirements and draft content separate
- Start a new writing session for a selected book
- Record session history per book
- View a past session’s transcript without starting a new active session
- Continue from any past session by starting a new active session that includes the current book context

**Out of scope (for this feature)**:

- Sharing books/sessions between different people
- Automated cleanup/retention rules for old sessions
- Advanced techniques to compress or summarize very large books (a simple baseline is acceptable)

### Functional Requirements

- **FR-001**: System MUST allow users to create a new book by providing a book name.
- **FR-002**: System MUST allow users to select an existing book to work on.
- **FR-003**: System MUST keep each book’s requirements and draft content isolated from other books.
- **FR-004**: System MUST allow starting a new writing session for a selected book.
- **FR-005**: System MUST capture a durable session record (at minimum: timestamp, transcript/progress events) so that sessions can be reviewed later.
- **FR-006**: Users MUST be able to view a list of prior sessions for a selected book.
- **FR-007**: Users MUST be able to view a prior session’s transcript/progress without starting a new live session.
- **FR-008**: Users MUST be able to create a new live session by “continuing” from any prior session.
- **FR-009**: When continuing from a prior session, the system MUST provide the new live session with the current book requirements and current book draft content.
- **FR-010**: The system MUST record when a session is continued from another session (traceability).
- **FR-011**: The system MUST support working on multiple books concurrently (e.g., separate browser tabs or separate users on the same machine) without cross-contamination.
- **FR-012**: The system MUST prevent unsafe access outside the selected book’s workspace when reading/writing files.

### Acceptance Criteria (for requirements)

- **AC-001 (FR-001/FR-002)**: Users can create a book and later select it again, and the system consistently shows the same book and its content.
- **AC-002 (FR-003)**: Editing requirements or draft content in Book A never changes what is shown for Book B.
- **AC-003 (FR-004)**: Starting a session for a selected book begins an interactive writing flow scoped to that book.
- **AC-004 (FR-005/FR-006/FR-007)**: After at least one session exists, users can see it in a list (with a timestamp) and open it to review the transcript without starting a new active session.
- **AC-005 (FR-008/FR-009/FR-010)**: Choosing “Continue” from a past session starts a *new* active session; that new session is linked back to the chosen session and includes the current book requirements and current draft content.
- **AC-006 (FR-011)**: Running two sessions for two different books (for example, two browser tabs) does not mix or overwrite content between books.
- **AC-007 (FR-012)**: Attempts to read/write outside the selected book area are blocked and shown as a clear error.

### Assumptions

- Book names are converted into a safe “book id” used for folder naming.
- By default, the product re-opens the most recently used book and shows the most recent session for that book.
- Until summarization is introduced, continuing a session may include the full current book text (which may become slow for very large books).

### Dependencies

- Users have access to local storage to save book content and session history.
- After crashes/reloads, users can re-open the app and use book selection + session history to pick up where they left off.

### Key Entities *(include if feature involves data)*

- **Book**: A distinct unit of work for one book (display name, book id, requirements set, draft/chapters)
- **Session**: One run of interactive work for a single book (session id, created time, selected mode, optional “continued from session id”)
- **Session Record**: A replayable transcript of what happened (timestamps, questions asked, user answers, and generated output summaries)
- **Requirement File**: A user-maintained set of constraints/goals for a book (purpose, last updated time)
- **Draft File**: A written chapter or section belonging to a book (title or file name, content)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a new book and start a session in under 30 seconds.
- **SC-002**: Switching between two existing books shows the correct draft/chapters and requirements on the first try in 99% of attempts.
- **SC-003**: After a page reload, users can view the most recent session’s transcript for the selected book without losing previously generated output in 95% of attempts.
- **SC-004**: Users can continue from any prior session and get a new live session running in under 15 seconds in 95% of attempts.
- **SC-005**: In usability testing, at least 80% of users correctly explain the difference between “View” (history) and “Continue” (new session) after using the UI once.
