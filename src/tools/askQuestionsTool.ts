import { z } from "zod";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { defineTool } from "@github/copilot-sdk";

const QuestionSchema = z.object({
  header: z
    .string()
    .min(1)
    .max(24)
    .describe("Short identifier for the question (used as the answer key)"),
  question: z.string().min(1).describe("The question text shown to the user"),
  multiSelect: z
    .boolean()
    .optional()
    .describe("Whether multiple options may be selected"),
  options: z
    .array(
      z.object({
        label: z.string().min(1),
        description: z.string().optional(),
        recommended: z.boolean().optional(),
      }),
    )
    .optional()
    .describe("Optional list of choices"),
});

export const askQuestionsTool = defineTool("ask_questions", {
  description:
    "Ask the human user one or more questions in the terminal and return their answers.",
  parameters: z.object({
    questions: z.array(QuestionSchema).min(1).max(6),
  }),
  handler: async ({ questions }) => {
    const rl = readline.createInterface({ input, output });
    try {
      const answers: Record<string, string | string[]> = {};

      for (const q of questions) {
        output.write(`\n${q.question}\n`);

        if (q.options?.length) {
          q.options.forEach((opt, idx) => {
            // Intentionally ignore `recommended` so we don't bias the user's choice.
            const rec = "";
            const desc = opt.description ? ` — ${opt.description}` : "";
            output.write(`  ${idx + 1}) ${opt.label}${rec}${desc}\n`);
          });

          if (q.multiSelect) {
            const raw = await rl.question(
              "Choose one or more numbers (comma-separated), or type a value: ",
            );
            const trimmed = raw.trim();
            const nums = trimmed
              .split(",")
              .map((s) => Number.parseInt(s.trim(), 10))
              .filter((n) => Number.isFinite(n));

            if (nums.length) {
              const picked = Array.from(
                new Set(
                  nums
                    .filter((n) => n >= 1 && n <= q.options!.length)
                    .map((n) => q.options![n - 1].label),
                ),
              );
              answers[q.header] = picked;
            } else {
              answers[q.header] = trimmed;
            }
          } else {
            const raw = await rl.question("Choose a number or type a value: ");
            const trimmed = raw.trim();
            const n = Number.parseInt(trimmed, 10);
            if (
              Number.isFinite(n) &&
              n >= 1 &&
              q.options &&
              n <= q.options.length
            ) {
              answers[q.header] = q.options[n - 1].label;
            } else {
              answers[q.header] = trimmed;
            }
          }
        } else {
          const raw = await rl.question("> ");
          answers[q.header] = raw.trim();
        }
      }

      return { answers };
    } finally {
      rl.close();
    }
  },
});
