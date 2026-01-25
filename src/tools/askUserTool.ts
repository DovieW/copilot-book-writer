import { z } from "zod";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { defineTool } from "@github/copilot-sdk";

const QuestionSchema = z.object({
  id: z.string().describe("Stable identifier for the question"),
  question: z.string().describe("Question to show the user"),
  options: z.array(z.string()).optional().describe("Optional list of choices"),
});

export const askUserTool = defineTool("ask_user", {
  description:
    "Ask the human user questions in the terminal and return their answers.",
  parameters: z.object({
    questions: z
      .array(QuestionSchema)
      .min(1)
      .max(6)
      .describe("List of questions to ask"),
  }),
  handler: async ({ questions }) => {
    const rl = readline.createInterface({ input, output });
    try {
      const answers: Record<string, string> = {};
      for (const q of questions) {
        if (q.options?.length) {
          output.write(`\n${q.question}\n`);
          q.options.forEach((opt, idx) => output.write(`  ${idx + 1}) ${opt}\n`));
          const raw = await rl.question("Choose a number or type a value: ");
          const n = Number.parseInt(raw.trim(), 10);
          if (Number.isFinite(n) && n >= 1 && n <= q.options.length) {
            answers[q.id] = q.options[n - 1];
          } else {
            answers[q.id] = raw.trim();
          }
        } else {
          const raw = await rl.question(`\n${q.question}\n> `);
          answers[q.id] = raw.trim();
        }
      }
      return { answers };
    } finally {
      rl.close();
    }
  },
});
