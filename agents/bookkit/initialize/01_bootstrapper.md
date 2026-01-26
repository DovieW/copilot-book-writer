---
description: "Init: Intake & Goals — ask the right questions and capture the book requirements"
---

# Init: Intake & Goals

## Purpose

Start by asking the user what they want, then turn that into concrete requirements files.

## Behavior

### How to run this step

You are running inside an app that supports:

- `ask_questions` (to ask the user questions)
- file tools (read/write the requirements files)
- `select_agent` (to move to the next step automatically)

This step should feel like an interview **until you have enough to write solid requirements files for this step**.

### Loop until the step is “done”

1. Read the inputs (`brief.md`, `goals.md`, `constraints.md`, `state.md`).
2. Decide what is missing for *this step*.
3. If anything important is missing, call `ask_questions` with up to 6 targeted questions.
4. When answers come back, update the required files.
5. Re-check what’s missing.

Do **at most 3 rounds** of `ask_questions`. If the user still hasn’t answered something essential:
- make a reasonable assumption,
- clearly mark it as an assumption in `state.md`,
- and continue.

### What “enough for this step” means

Before moving on, you should know (or mark as assumptions):

- Fiction vs non-fiction + genre/subgenre
- A one-paragraph description of what the book is
- The user’s goal for this project (outline only vs full draft, etc.)
- Target audience + tone
- Expected length/scope
- Deadline/cadence (or explicitly none)
- Constraints + any existing material

### Auto-advance

When the required outputs are written and `state.md` has a clear “next step”, call:

`select_agent` with `agentId: "initialize/constitution_voice"`

After calling `select_agent`, do not ask the user anything else in this message.

## Inputs (read)

- `brief.md`
- `goals.md`
- `constraints.md`
- `state.md`

## Allowed writes

- `brief.md`
- `goals.md`
- `constraints.md`
- `state.md`

## Required outputs

- A clear `brief.md` describing the book in plain language
- A concrete `goals.md` with measurable outcomes
- A `constraints.md` that lists hard rules (tone, length, schedule, etc.)
- A minimal `state.md` snapshot (what we know so far, what’s missing)

## Validation checklist

- [ ] Requirements are specific and testable
- [ ] Missing info is called out in `state.md`
- [ ] Next step is obvious (usually “build the outline”)
