export type AskQuestionsPayload = {
  questions: Array<{
    header: string;
    question: string;
    multiSelect?: boolean;
    options?: Array<{
      label: string;
      description?: string;
      recommended?: boolean;
    }>;
  }>;
};

export type AskQuestionsAnswerPayload = {
  answers: Record<string, string | string[]>;
};

export type ServerEvent =
  | { type: "status"; data: { message: string } }
  | { type: "assistant.delta"; data: { delta: string } }
  | { type: "assistant.message"; data: { content: string } }
  | { type: "user.message"; data: { content: string } }
  | { type: "ask_questions"; data: AskQuestionsPayload }
  | { type: "file.updated"; data: { path: string } }
  | { type: "error"; data: { message: string } };
