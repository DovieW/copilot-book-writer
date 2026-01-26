# BookKit Agent Prompts (Vendored)

These prompt files are **vendored** from the BookKit repository so users can clone this repo and run the UI without extra setup.

## Source of truth

- Source repo: BookKit
- Source path: `book-kit/agents/`

## Update policy

Only the project maintainer updates these files. End users do **not** install or upgrade agents from the UI.

## How to update

1. Pull the latest BookKit repo.
2. Copy the contents of `book-kit/agents/` into `agents/bookkit/` in this repo.
3. Review changes, then commit.

## Notes

- This folder is data-only (prompt text). No runtime code should be added here.
- The UI reads these prompts via the backend agent catalog.
