import { CopilotClient } from "@github/copilot-sdk";
import { askUserTool } from "./tools/askUserTool.js";

export type WriteChunkOptions = {
  model: string;
  requirementsMarkdown: string;
  currentDraft: string;
  section: string;
  words: number;
};

export async function generateChunk(options: WriteChunkOptions): Promise<string> {
  const client = new CopilotClient({
    cliPath: process.env.COPILOT_CLI_PATH,
    cliArgs: process.env.COPILOT_CLI_ARGS
      ? process.env.COPILOT_CLI_ARGS.split(" ").filter(Boolean)
      : undefined,
  });

  await client.start();

  try {
    const session = await client.createSession({
      model: options.model,
      tools: [askUserTool],
      systemMessage: {
        content: `
You are a careful book-writing assistant.

Rules:
- Write ONLY the next chunk for the requested section.
- Stay consistent with the existing draft.
- Follow the requirements. If requirements conflict or are missing, ask the user 1-4 targeted questions using the ask_user tool.
- Output should be clean Markdown prose (no meta commentary).
        `.trim(),
      },
    });

    const prompt = `
We are writing a full-length book incrementally.

## Target
- Section to write next: ${options.section}
- Target length: ~${options.words} words

## Requirements (source of truth)
${options.requirementsMarkdown || "(none)"}

## Current draft
${options.currentDraft ? options.currentDraft : "(empty)"}

Now write the next chunk for the target section. If you need clarifications, ask via the ask_user tool.
`.trim();

    const final = await session.sendAndWait({ prompt }, 10 * 60 * 1000);
    const content = final?.data?.content?.trim();
    if (!content) {
      throw new Error("Copilot session returned no assistant content.");
    }

    await session.destroy();
    return content;
  } finally {
    await client.stop();
  }
}
