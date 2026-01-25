import path from "node:path";

import { CopilotClient } from "@github/copilot-sdk";
import { askQuestionsTool } from "./tools/askQuestionsTool.js";
import { createFileTools } from "./tools/fileTools.js";

export type InteractiveOptions = {
  repoRoot: string;
  model: string;
};

type Mode = "easy" | "hard";

function parseMode(text: string | undefined): Mode {
  const t = (text || "").toLowerCase();
  if (t.includes("mode=easy") || t.includes("mode: easy") || t.includes("easy mode")) {
    return "easy";
  }
  if (t.includes("mode=hard") || t.includes("mode: hard") || t.includes("hard mode")) {
    return "hard";
  }
  // Default to hard to avoid accidental over-assumption.
  return "hard";
}

export async function runInteractive(options: InteractiveOptions): Promise<void> {
  const client = new CopilotClient({
    cliPath: process.env.COPILOT_CLI_PATH,
    cliArgs: process.env.COPILOT_CLI_ARGS
      ? process.env.COPILOT_CLI_ARGS.split(" ").filter(Boolean)
      : undefined,
  });

  await client.start();

  try {
    // 1) Bootstrap session: ask easy vs hard.
    const bootstrap = await client.createSession({
      model: options.model,
      tools: [askQuestionsTool],
      systemMessage: {
        content: `
You are onboarding for Copilot Book Writer.

You MUST call the tool ask_questions first and ask:
- header: mode
- question: "Do you want easy mode or hard mode?"
- options: Easy mode (make more assumptions) vs Hard mode (ask more questions)

After the user answers, respond with EXACTLY one line:
MODE=easy
or
MODE=hard
        `.trim(),
      },
    });

    const bootstrapResp = await bootstrap.sendAndWait({
      prompt: "Start onboarding.",
    });

    const mode = parseMode(bootstrapResp?.data?.content);
    await bootstrap.destroy();

    // 2) Main interactive session: requirements -> write -> review loop.
    const fileTools = createFileTools({ repoRoot: options.repoRoot });

    const modeGuidance =
      mode === "easy"
        ? `
EASY MODE:
- Make reasonable assumptions when requirements are incomplete.
- Ask fewer questions; only ask when blocked.
- When you assume something important, write it back into requirements/feedback.md.
          `.trim()
        : `
HARD MODE:
- Ask more questions up-front to avoid wrong assumptions.
- Prefer clarifying details in requirements before writing prose.
- Keep requirements explicit and consistent.
          `.trim();

    const session = await client.createSession({
      model: options.model,
      tools: [askQuestionsTool, ...fileTools],
      systemMessage: {
        content: `
You are Copilot Book Writer running inside a terminal CLI.

Your job:
1) Help the user fill out requirements files in requirements/.
2) When ready, write the book chapter-by-chapter and paragraph-by-paragraph into book/.
3) After each paragraph (or small chunk), ask the user if they like it.
4) If the user requests changes, apply them by editing the book files AND update requirements so constraints stay in sync.

Non-negotiables:
- Use ask_questions to ask the user questions.
- Use read_text_file/write_text_file/append_text_file/list_files to read and write repo files.
- Keep questions targeted (1–4 at a time).
- Do not output meta commentary; treat tool calls + file updates as the work.

${modeGuidance}

Stop condition:
- If the user chooses "Stop", end the session with a short summary of what files were updated and what to do next.
        `.trim(),
      },
    });

    const repoRel = (p: string) => path.relative(options.repoRoot, p);

    const initialPrompt = `
We are starting an interactive book-writing session.

Repository root: ${repoRel(options.repoRoot)}

First:
- Review the existing files under requirements/ (use list_files + read_text_file).
- Ask the user whatever you need to fully define the book.
- Write updates into the requirements files.

Then:
- Ask: "Are we ready to start writing?" (Yes / Not yet / Stop)

When ready:
- Create book/chapter-01.md if it does not exist.
- Write ONE paragraph for Chapter 1.
- Ask the user if they like it (Looks good / Needs changes / Stop).
- If needs changes, ask for feedback and apply changes.
- Continue paragraph-by-paragraph and eventually create later chapters.

Remember: keep requirements in sync with decisions and feedback.
`.trim();

    await session.sendAndWait({ prompt: initialPrompt }, 60 * 60 * 1000);

    await session.destroy();
  } finally {
    await client.stop();
  }
}
