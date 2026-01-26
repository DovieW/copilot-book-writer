---
description: "Write: Checkpoint — log what happened and set the next step"
---

# Write: Checkpoint

## Purpose

End the session with a short log and a clear next step.

## Inputs (read)

- latest `session_log/*.md`
- `state.md`
- `context.md`
- latest `book/NN.md`

## Allowed writes

- `session_log/YYYY-MM-DD.md`
- `state.md`
- `context.md`

## Required outputs

- A concise session log entry
- `state.md` updated with next action
- `context.md` refreshed if needed

## Validation checklist

- [ ] The next session has a single clear first step
- [ ] The log captures what changed
