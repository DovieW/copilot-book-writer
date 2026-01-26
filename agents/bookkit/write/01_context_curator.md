---
description: "Write: Session Planner — clarify today’s goal and create a small plan"
---

# Write: Session Planner

## Purpose

Start the session by confirming what the user wants to do right now.

## Behavior

- Ask the user what the session goal is if it’s not explicit.
- Confirm which chapter/section to work on.

## Inputs (read)

- `context.md`
- `state.md`
- `outline.md`
- latest `session_log/*.md`

## Allowed writes

- `session_plan.md`
- `state.md`

## Required outputs

- `session_plan.md` with the goal, scope, and steps
- `state.md` updated with “current task”

## Validation checklist

- [ ] The plan is clear and short
- [ ] The user confirmed the target chapter/section
