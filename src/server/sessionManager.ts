import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { CopilotSession } from "@github/copilot-sdk";
import { CopilotClient } from "@github/copilot-sdk";
import type { AskQuestionsAnswerPayload, AskQuestionsPayload, ServerEvent } from "./types.js";
import { createAskQuestionsTool } from "./tools/askQuestionsBridge.js";
import { createFileToolsWithEvents } from "./tools/fileToolsWithEvents.js";
import { getBookLayout } from "../bookLayout.js";

type Subscriber = (evt: ServerEvent) => void;

type PendingAsk = {
  resolve: (answers: AskQuestionsAnswerPayload) => void;
  reject: (err: Error) => void;
};

type SessionState = {
  id: string;
  bookId: string;
  session: CopilotSession;
  subscribers: Set<Subscriber>;
  pendingAsk?: PendingAsk;
  started?: boolean;
  eventLogPath: string;
};

export type SessionMode = "easy" | "hard";

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

    // Fire-and-forget persistence of events (used for reload/replay).
    void this.appendEventLog(s, evt);

    for (const sub of s.subscribers) sub(evt);
  }

  private async appendEventLog(s: SessionState, evt: ServerEvent): Promise<void> {
    try {
      const line = JSON.stringify({ ts: Date.now(), ...evt }) + "\n";
      await fs.mkdir(path.dirname(s.eventLogPath), { recursive: true });
      await fs.appendFile(s.eventLogPath, line, "utf8");
    } catch {
      // Intentionally ignore persistence errors.
    }
  }

  subscribe(id: string, sub: Subscriber): () => void {
    const s = this.sessions.get(id);
    if (!s) throw new Error("Unknown session");
    s.subscribers.add(sub);
    return () => s.subscribers.delete(sub);
  }

  async createSession(
    mode: SessionMode,
    bookId: string,
    model?: string,
  ): Promise<{ sessionId: string; bookId: string }> {
    const id = crypto.randomUUID();

    const layout = getBookLayout(this.repoRoot, bookId);
    await fs.mkdir(layout.requirementsDir, { recursive: true });
    await fs.mkdir(layout.draftDir, { recursive: true });
    await fs.mkdir(layout.sessionsDir, { recursive: true });

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
      allowedRoots: {
        requirementsDirAbs: layout.requirementsDir,
        bookDirAbs: layout.draftDir,
      },
      onFileUpdated: (p) => this.emit(id, { type: "file.updated", data: { path: p } }),
    });

    const modeGuidance =
      mode === "easy"
        ? `
EASY MODE:
- Make reasonable assumptions when requirements are incomplete.
- Ask fewer questions.
- When you assume something important, record it in books/${layout.bookId}/requirements/feedback.md.
          `.trim()
        : `
HARD MODE:
- Ask more questions up-front.
- Prefer explicit requirements before writing prose.
          `.trim();

    const systemMessage = `
  You are Copilot Book Writer running inside a web UI.

The UI has:
- a chat panel (left)
- a live chapter view (right)

Rules (non-negotiable):
- After the mode is chosen, guide the user to fill requirements in books/${layout.bookId}/requirements/*.md.
- When ready, write chapter files under books/${layout.bookId}/book/ (e.g. books/${layout.bookId}/book/chapter-01.md) paragraph-by-paragraph.
- After each paragraph (or small chunk), ask if the user likes it.
- If the user requests changes, apply them and update books/${layout.bookId}/requirements/feedback.md when the change becomes a new constraint.

Mode selected by the user (deterministic): ${mode}

${modeGuidance}

Tools:
- ask_questions (ask the user questions)
- read_text_file/write_text_file/append_text_file/list_files (read/write files under books/${layout.bookId}/requirements/ and books/${layout.bookId}/book/)

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
      bookId: layout.bookId,
      session,
      subscribers: new Set(),
      started: false,
      eventLogPath: path.resolve(layout.sessionsDir, `${id}.jsonl`),
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

    this.emit(id, { type: "status", data: { message: "session_created" } });

    return { sessionId: id, bookId: layout.bookId };
  }

  async startSession(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) throw new Error("Unknown session");
    if (s.started) return;

    s.started = true;
    await s.session.send({
      prompt: `
Start an interactive book-writing session.

First:
- Review the existing files under books/${s.bookId}/requirements/.
- Ask the user targeted questions to fill gaps.
- Write updates into books/${s.bookId}/requirements/*.md.

Then:
- Ask: "Are we ready to start writing?" (Yes / Not yet / Stop)

When ready:
- Create books/${s.bookId}/book/chapter-01.md if it does not exist.
- Write ONE paragraph for Chapter 1.
- Ask the user if they like it (Looks good / Needs changes / Stop).
- If needs changes, ask for feedback and apply changes.
- Continue paragraph-by-paragraph.
      `.trim(),
      mode: "enqueue",
    });
  }

  getSessionInfo(id: string): { exists: boolean; started?: boolean; bookId?: string } {
    const s = this.sessions.get(id);
    if (!s) return { exists: false };
    return { exists: true, started: !!s.started, bookId: s.bookId };
  }

  async replayEventLog(
    id: string,
    send: (evt: ServerEvent) => void,
  ): Promise<{ found: boolean }>{
    const s = this.sessions.get(id);
    const eventLogPath = s?.eventLogPath;
    if (!eventLogPath) return { found: false };

    try {
      const raw = await fs.readFile(eventLogPath, "utf8");
      const lines = raw.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed.type === "string" && parsed.data) {
            // Strip the stored ts field if present.
            const { ts: _ts, ...rest } = parsed;
            send(rest as ServerEvent);
          }
        } catch {
          // ignore malformed lines
        }
      }
      return { found: true };
    } catch {
      return { found: false };
    }
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
