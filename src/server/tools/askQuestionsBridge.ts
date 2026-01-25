import { defineTool } from "@github/copilot-sdk";
import { z } from "zod";
import type {
  AskQuestionsAnswerPayload,
  AskQuestionsPayload,
} from "../types.js";

export type AskQuestionsBroker = {
  ask: (payload: AskQuestionsPayload) => Promise<AskQuestionsAnswerPayload>;
};

const QuestionSchema = z.object({
  header: z.string().min(1).max(24),
  question: z.string().min(1),
  multiSelect: z.boolean().optional(),
  options: z
    .array(
      z.object({
        label: z.string().min(1),
        description: z.string().optional(),
        recommended: z.boolean().optional(),
      }),
    )
    .optional(),
});

export function createAskQuestionsTool(broker: AskQuestionsBroker) {
  return defineTool("ask_questions", {
    description:
      "Ask the human user one or more questions via the UI and return their answers.",
    parameters: z.object({
      questions: z.array(QuestionSchema).min(1).max(6),
    }),
    handler: async ({ questions }) => {
      const result = await broker.ask({ questions });
      return result;
    },
  });
}
