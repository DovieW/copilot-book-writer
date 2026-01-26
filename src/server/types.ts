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

// UI event payload: includes a stable id so the client can correlate
// question cards with submitted answers and replayed history.
export type AskQuestionsEventPayload = AskQuestionsPayload & {
  askId: string;
};

export type AskQuestionsAnswerPayload = {
  answers: Record<string, string | string[]>;
};

export type SessionInfoPayload = {
  exists: boolean;
  started?: boolean;
  bookId?: string;
  model?: string;
  pendingAsk?: boolean;
  pendingAskId?: string | null;
};

export type ServerEvent =
  | { type: "session.info"; data: SessionInfoPayload }
  | { type: "replay"; data: { phase: "begin" | "end" } }
  | { type: "status"; data: { message: string } }
  | { type: "assistant.delta"; data: { delta: string } }
  | { type: "assistant.message"; data: { content: string } }
  | { type: "user.message"; data: { content: string } }
  | { type: "system.message"; data: { content: string } }
  | { type: "ask_questions"; data: AskQuestionsEventPayload }
  | { type: "ask_questions.answered"; data: { askId: string; answers: AskQuestionsAnswerPayload } }
  | { type: "file.updated"; data: { path: string } }
  | { type: "agent.selected"; data: { agentId: string } }
  | { type: "error"; data: { message: string } };
