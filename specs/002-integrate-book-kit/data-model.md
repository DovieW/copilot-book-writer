# Data Model: Integrate BookKit Agents

This feature adds a small “agent catalog” concept so the UI can show a dropdown and attach the selected agent to message sends.

## Entities

### AgentMode

Represents one selectable BookKit prompt.

- `id: string`
  - Stable identifier used by UI when sending a message.
  - Recommended shape: path-like id derived from file location, e.g. `write/draft`.
- `displayName: string`
  - Human-friendly label shown in the dropdown.
- `description?: string`
  - Optional short explanation.
- `promptPath: string`
  - Relative path to the vendored prompt file within this repo (server uses this to load prompt contents).

### AgentCatalog

A snapshot list of available agents/modes.

- `agents: AgentMode[]`
- `defaultAgentId?: string`

### BookKitStatus

Represents whether the backend can serve BookKit agents.

- `ok: boolean`
- `error?: string`

## Behavioral Rules

- The UI selection is **ephemeral** (not persisted into session history).
- Switching selection affects the *next* message.
- If a response is currently streaming, switching does not cancel it; it affects the next message.

## Relationships

- `AgentMode` is not stored on `WritingSession`.
- A message send request may reference an `AgentMode` by `id`.
