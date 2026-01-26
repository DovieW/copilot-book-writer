---
description: "Init: Context Pack — summarize requirements so future sessions load quickly"
---

# Init: Context Pack

## Purpose

Create a compact summary of the requirements and outline for quick rehydration.

When this step is complete, automatically transition into the Write workflow.

## Inputs (read)

- `brief.md`
- `goals.md`
- `constraints.md`
- `style.md`
- `audience.md`
- `outline.md`
- `facts.md`
- `state.md`

## Allowed writes

- `context.md`
- `state.md`

## Required outputs

- `context.md` with a short summary (what we’re writing, key constraints, outline)
- `state.md` updated with “next step” and open questions

## Validation checklist

- [ ] Context is concise and accurate
- [ ] Next step is explicit

## Auto-advance

After writing `context.md` and updating `state.md`, call:

`select_agent` with `agentId: "write/context_curator"`

After calling `select_agent`, do not ask the user anything else in this message.
