import crypto from "node:crypto";
import type { CopilotSession } from "@github/copilot-sdk";
import { CopilotClient } from "@github/copilot-sdk";
import type { AskQuestionsAnswerPayload, AskQuestionsPayload, ServerEvent } from "./types.js";
import { createAskQuestionsTool } from "./tools/askQuestionsBridge.js";
import { createFileToolsWithEvents } from "./tools/fileToolsWithEvents.js";

type Subscriber = (evt: ServerEvent) => void;

type PendingAsk = {
  resolve: (answers: AskQuestionsAnswerPayload) => void;
  reject: (err: Error) => void;
};

type SessionState = {
  id: string;
  session: CopilotSession;
  subscribers: Set<Subscriber>;
  pendingAsk?: PendingAsk;
};

export type SessionManagerOptions = {
  repoRoot: string;
  cliPath?: string;
  cliArgs?: string[];
  modelDefault: string;
};

export class SessionManager {
  private readonly repoRoot: string;
  private readonly modelDefault: string;
  private readonly client: CopilotClient;
  private readonly sessions = new Map<string, SessionState>();

  constructor(options: SessionManagerOptions) {
    this.repoRoot = options.repoRoot;
    this.modelDefault = options.modelDefault;
    this.client = new CopilotClient({
      cliPath: options.cliPath,
      cliArgs: options.cliArgs,
    });
  }

  async start(): Promise<void> {
    await this.client.start();
  }

  async stop(): Promise<void> {
    const errors = await this.client.stop();
    if (errors.length) {
      // eslint-disable-next-line no-console
      console.error("Errors during Copilot client stop:", errors);
    }
  }

  private emit(id: string, evt: ServerEvent): void {
    const s = this.sessions.get(id);
    if (!s) return;
    for (const sub of s.subscribers) sub(evt);
  }

  subscribe(id: string, sub: Subscriber): () => void {
    const s = this.sessions.get(id);
    if (!s) throw new Error("Unknown session");
    s.subscribers.add(sub);
    return () => s.subscribers.delete(sub);
  }

  async createSession(model?: string): Promise<{ sessionId: string }>
  {
    const id = crypto.randomUUID();

    const broker = {
      ask: async (payload: AskQuestionsPayload): Promise<AskQuestionsAnswerPayload> => {
        if (this.sessions.get(id)?.pendingAsk) {
          throw new Error("Already waiting for answers");
        }

        this.emit(id, { type: "ask_questions", data: payload });

        return await new Promise<AskQuestionsAnswerPayload>((resolve, reject) => {
          const s = this.sessions.get(id);
          if (!s) {
            reject(new Error("Session not found"));
            return;
          }
          s.pendingAsk = { resolve, reject };
        });
      },
    };

    const askQuestionsTool = createAskQuestionsTool(broker);

    const fileTools = createFileToolsWithEvents({
      repoRoot: this.repoRoot,
      onFileUpdated: (p) => this.emit(id, { type: "file.updated", data: { path: p } }),
    });

    const systemMessage = `
You are Copilot Book Writer running inside a web UI.

The UI has:
- a chat panel (left)
- a live chapter view (right)

Rules (non-negotiable):
- The FIRST thing you do is call the tool ask_questions and ask:
  - header: mode
  - question: "Do you want easy mode or hard mode?"
  - options: "Easy mode" (make more assumptions) and "Hard mode" (ask more questions)
- After the mode is chosen, guide the user to fill requirements in requirements/*.md.
- When ready, write chapter files under book/ (e.g. book/chapter-01.md) paragraph-by-paragraph.
- After each paragraph (or small chunk), ask if the user likes it.
- If the user requests changes, apply them and update requirements/feedback.md when the change becomes a new constraint.

Easy mode behavior:
- Make reasonable assumptions when requirements are incomplete.
- Ask fewer questions.
- When you assume something important, record it in requirements/feedback.md.

Hard mode behavior:
- Ask more questions up-front.
- Prefer explicit requirements before writing prose.

Tools:
- ask_questions (ask the user questions)
- read_text_file/write_text_file/append_text_file/list_files (read/write files under requirements/ and book/)

Never include meta commentary; keep responses user-facing.
    `.trim();

    const session = await this.client.createSession({
      model: model || this.modelDefault,
      streaming: true,
      tools: [askQuestionsTool, ...fileTools],
      systemMessage: { content: systemMessage },
    });

    const state: SessionState = {
      id,
      session,
      subscribers: new Set(),
    };

    this.sessions.set(id, state);

    session.on((event: any) => {
      try {
        if (event?.type === "assistant.message_delta") {
          const delta = event?.data?.deltaContent;
          if (typeof delta === "string" && delta.length) {
            this.emit(id, { type: "assistant.delta", data: { delta } });
          }
        } else if (event?.type === "assistant.message") {
          const content = event?.data?.content;
          if (typeof content === "string") {
            this.emit(id, { type: "assistant.message", data: { content } });
          }
        } else if (event?.type === "user.message") {
          const content = event?.data?.content;
          if (typeof content === "string") {
            this.emit(id, { type: "user.message", data: { content } });
          }
        }
      } catch (err: any) {
        this.emit(id, { type: "error", data: { message: err?.message || String(err) } });
      }
    });

    // Kick off onboarding. This should trigger ask_questions for mode.
    await session.send({ prompt: "Start.", mode: "enqueue" });

    this.emit(id, { type: "status", data: { message: "session_created" } });

    return { sessionId: id };
  }

  async sendMessage(id: string, prompt: string): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) throw new Error("Unknown session");
    await s.session.send({ prompt, mode: "enqueue" });
  }

  answerQuestions(id: string, answers: AskQuestionsAnswerPayload): void {
    const s = this.sessions.get(id);
    if (!s) throw new Error("Unknown session");
    if (!s.pendingAsk) throw new Error("No pending questions");
    s.pendingAsk.resolve(answers);
    s.pendingAsk = undefined;
  }

  async destroySession(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    if (s.pendingAsk) {
      s.pendingAsk.reject(new Error("Session destroyed"));
    }
    await s.session.destroy();
  }
}
