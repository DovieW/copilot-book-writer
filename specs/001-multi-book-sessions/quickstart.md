# Quickstart: Multi-book Sessions & History

**Feature**: [Multi-book Sessions & History](./spec.md)
**Date**: 2026-01-25

This is a quick “how to try it” guide for the multi-book + session history feature.

## What you can do

- Create/select a book so your work stays separated from other books
- Start a writing session for that book
- View past sessions (read-only replay)
- Continue from any past session (starts a new session seeded from current files)

## Prerequisites

- Node.js 18+
- Project dependencies installed (`npm install` at repo root)

## Run the app (server + web)

1. Start the dev server + web UI.
2. Open the web UI in your browser.

(Exact commands may vary by environment; see the root `package.json` scripts.)

## Try the feature in the web UI

1. **Create a book**
   - Enter a new book name.
   - Confirm the app shows that book as selected.

2. **Start a session**
   - Pick a mode (for example “easy” or “hard”).
   - Click Start.

3. **Write a bit**
   - Send a prompt.
   - Confirm output streams and draft/requirements updates are scoped to the selected book.

4. **View history**
   - Open the book’s session list.
   - Click “View” on a prior session.
   - Confirm you can read the transcript without starting a new active session.

5. **Continue from history**
   - Click “Continue” on a prior session.
   - Confirm a NEW session is created (different session id) and it is linked to the prior one.
   - Confirm the new session uses the **current** book requirements and **current** draft content.

## Try the feature in the CLI

1. Run the CLI and choose:
   - Mode
   - Book name

2. Start writing.

3. Verify files are created/updated under:

- `books/<bookId>/requirements/`
- `books/<bookId>/book/`
- `books/<bookId>/.sessions/`

## Success checks

- Creating/editing files in Book A never changes Book B.
- After a reload, you can still open a prior session transcript.
- “Continue” always works even if the prior session is no longer live.
