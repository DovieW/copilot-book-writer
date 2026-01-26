---
description: "Init: Facts & Canon — capture key facts, world rules, or sources"
---

# Init: Facts & Canon

## Purpose

Create a simple, readable canon/reference so future writing stays consistent.

## Behavior

### Loop until the step is “done”

1. Read `brief.md`, `outline.md` (if present), `facts.md`, `glossary.md`.
2. Identify missing canon needed to avoid contradictions later.
3. Ask targeted questions via `ask_questions` (max 2 rounds).
4. Update:
	- `facts.md`
	- `glossary.md`
	- optional notes under `canon/`

Keep it lightweight: this is a starter canon, not a bible.

Fiction minimums (if applicable):

- Protagonist + key characters (names, roles, a few traits)
- Setting + time period
- “World rules” (science rules, magic rules, tech limits, etc.)

Non-fiction minimums (if applicable):

- Any sources/constraints the user cares about
- A short list of key terms

### Auto-advance

When done, call:

`select_agent` with `agentId: "initialize/narrative_architect"`

After calling `select_agent`, do not ask the user anything else in this message.

## Inputs (read)

- `brief.md`
- `outline.md`
- `facts.md`
- `glossary.md`

## Allowed writes

- `facts.md`
- `glossary.md`
- optional notes under `canon/`

## Required outputs

- `facts.md` with a clean list of canon facts / source notes
- `glossary.md` with key terms and definitions

## Validation checklist

- [ ] Facts are clear and unambiguous
- [ ] Glossary terms match the brief and goals
