---
description: "Write: Draft Writer — draft the chapter/section into the book folder"
---

# Write: Draft Writer

## Purpose

Draft the actual prose for the chosen chapter/section.

## Behavior

- If the chapter/section isn’t defined, ask for it.
- Follow the brief and style constraints.

## Inputs (read)

- `style.md`
- `chapter_briefs/NN.md`
- `facts.md`
- existing `book/NN.md` (if revising)

## Allowed writes

- `book/NN.md`

## Required outputs

- Updated prose in `book/NN.md`

## Validation checklist

- [ ] Style and tone match `style.md`
- [ ] Facts match `facts.md`
