# Data Model: Multi-book Sessions & History

**Feature**: [Multi-book Sessions & History](./spec.md)
**Date**: 2026-01-25

This describes the data entities and relationships required by the feature. It is technology-agnostic: it does not require a specific database.

## Entities

### Book

Represents one book project (requirements + draft content + session history).

**Fields**:

- `bookId` (string): safe identifier derived from book name (used to scope storage)
- `displayName` (string): the name shown to the user
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

**Relationships**:

- One `Book` has many `Session`s
- One `Book` has many `RequirementFile`s
- One `Book` has many `DraftFile`s

**Validation rules**:

- `bookId` must be non-empty and safe for use as a folder name
- `displayName` must be non-empty

---

### Session

Represents one interactive run working on a specific book.

**Fields**:

- `sessionId` (string): unique identifier
- `bookId` (string): references `Book.bookId`
- `createdAt` (timestamp)
- `mode` (string): user-selected mode (for example: easy/hard)
- `status` (enum): `active` | `completed` | `failed`
- `continuedFromSessionId` (string, optional): reference to the session this was continued from
- `summary` (string, optional): short human-readable summary for the session list

**Relationships**:

- One `Session` has many `SessionRecord`s

**State transitions**:

- `active → completed`
- `active → failed`

---

### SessionRecord

A single replayable event within a session (used for “View” and for seeding context during “Continue”).

**Fields**:

- `sessionId` (string): references `Session.sessionId`
- `seq` (integer): monotonically increasing sequence number within the session
- `timestamp` (timestamp)
- `type` (string): event type (examples: user message, assistant output chunk, tool question, error)
- `payload` (object/string): event data

**Validation rules**:

- `seq` must be unique per (`sessionId`)
- Event ordering is defined by `seq` (primary) and `timestamp` (secondary)

---

### RequirementFile

A user-editable requirements/constraints document for a book.

**Fields**:

- `bookId` (string): references `Book.bookId`
- `name` (string): file name/identifier (e.g., `feedback.md`)
- `purpose` (string, optional)
- `updatedAt` (timestamp)

**Validation rules**:

- `name` must not allow directory traversal

---

### DraftFile

A user-editable draft document for a book (chapters/sections).

**Fields**:

- `bookId` (string): references `Book.bookId`
- `name` (string): file name/identifier (e.g., `chapter-01.md`)
- `updatedAt` (timestamp)

**Validation rules**:

- `name` must not allow directory traversal

## Derived Views

### Session List (per book)

A book-scoped view of sessions for UI display.

**Sort order**: most recent first.

**Fields**:

- `sessionId`, `createdAt`, `mode`, `status`, `continuedFromSessionId`, `summary`

### Transcript View (per session)

A read-only replay of `SessionRecord`s in `seq` order.
