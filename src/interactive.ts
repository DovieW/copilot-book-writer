import path from "node:path";
import fs from "node:fs/promises";

import { CopilotClient } from "@github/copilot-sdk";
import { askQuestionsTool } from "./tools/askQuestionsTool.js";
import { createFileTools } from "./tools/fileTools.js";
import { getBookLayout, slugifyBookName } from "./bookLayout.js";

export type InteractiveOptions = {
  repoRoot: string;
  model: string;
  bookId?: string;
};

function parseBook(text: string | undefined): string {
  const t = (text || "").trim();
  const m = t.match(/BOOK\s*=\s*(.+)/i);
  return (m?.[1] || "").trim();
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
    // 1) Bootstrap session: ask book name.
    const bootstrap = await client.createSession({
      model: options.model,
      tools: [askQuestionsTool],
      systemMessage: {
        content: `
You are onboarding for Copilot Book Writer.

You MUST call the tool ask_questions first and ask:
- header: book

- question: "What is the book name?"

After the user answers, respond with EXACTLY two lines:
BOOK=<book name>
        `.trim(),
      },
    });

    const bootstrapResp = await bootstrap.sendAndWait({
      prompt: "Start onboarding.",
    });

    const rawBookName = parseBook(bootstrapResp?.data?.content);
    const bookId = slugifyBookName(rawBookName || options.bookId || "default");

    await bootstrap.destroy();

    // 2) Main interactive session: requirements -> write -> review loop.
    const layout = getBookLayout(options.repoRoot, bookId);
    await fs.mkdir(layout.requirementsDir, { recursive: true });
    await fs.mkdir(layout.draftDir, { recursive: true });

    const fileTools = createFileTools({
      repoRoot: options.repoRoot,
      allowedRoots: {
        requirementsDirAbs: layout.requirementsDir,
        bookDirAbs: layout.draftDir,
      },
    });

    const session = await client.createSession({
      model: options.model,
      tools: [askQuestionsTool, ...fileTools],
      systemMessage: {
        content: `
You are Copilot Book Writer running inside a terminal CLI.

Your job:
1) Help the user fill out requirements files in books/${layout.bookId}/requirements/.
2) When ready, write the book chapter-by-chapter and paragraph-by-paragraph into books/${layout.bookId}/book/.
3) After each paragraph (or small chunk), ask the user if they like it.
4) If the user requests changes, apply them by editing the book files AND update requirements so constraints stay in sync.

Non-negotiables:
- Use ask_questions to ask the user questions.
- Use read_text_file/write_text_file/append_text_file/list_files to read and write repo files.
- Keep questions targeted (1–4 at a time).
- Do not output meta commentary; treat tool calls + file updates as the work.

Stop condition:
- If the user chooses "Stop", end the session with a short summary of what files were updated and what to do next.
        `.trim(),
      },
    });

    const repoRel = (p: string) => path.relative(options.repoRoot, p);

    const initialPrompt = `
We are starting an interactive book-writing session.

Repository root: ${repoRel(options.repoRoot)}
  Book: ${layout.bookId}

First:
  - Review the existing files under books/${layout.bookId}/requirements/ (use list_files + read_text_file).
- Ask the user whatever you need to fully define the book.
- Write updates into the requirements files.

Then:
- Ask: "Are we ready to start writing?" (Yes / Not yet / Stop)

When ready:
- Create books/${layout.bookId}/book/chapter-01.md if it does not exist.
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
