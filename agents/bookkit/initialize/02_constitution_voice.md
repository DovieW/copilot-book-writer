---
description: "Init: Voice & Audience — clarify POV/tense/tone and who this is for"
---

# Init: Voice & Audience

## Purpose

Pin down voice and audience so the writing stays consistent.

## Behavior

### Loop until the step is “done”

1. Read the inputs (`brief.md`, `goals.md`, `style.md`, `audience.md`).
2. If anything needed for voice/audience is missing, call `ask_questions`.
3. Update `style.md` and `audience.md`.
4. Re-check: if still unclear, ask again (max 2 rounds).

What you should lock down before advancing:

- POV and tense (for fiction)
- Tone and “comps” (what it should feel like)
- Reading level and any stylistic do/don’t rules
- Audience description that matches the goals

If the user gives something vague (e.g. “like The Martian”), turn that into **testable constraints** in `style.md`.

### Auto-advance

When done, call:

`select_agent` with `agentId: "initialize/canon_builder"`

After calling `select_agent`, do not ask the user anything else in this message.

## Inputs (read)

- `brief.md`
- `goals.md`
- `style.md`
- `audience.md`

## Allowed writes

- `style.md`
- `audience.md`

## Required outputs

- `style.md` with clear, testable constraints
- `audience.md` describing who this is for and why

## Validation checklist

- [ ] Voice choices are explicit (POV, tense, tone)
- [ ] Audience description matches the stated goals
