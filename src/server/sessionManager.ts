import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { CopilotSession } from "@github/copilot-sdk";
import { CopilotClient } from "@github/copilot-sdk";
import type {
  AskQuestionsAnswerPayload,
  AskQuestionsPayload,
  ServerEvent,
  SessionInfoPayload,
} from "./types.js";
import { createAskQuestionsTool } from "./tools/askQuestionsBridge.js";
import { createAgentSelectionTool } from "./tools/agentSelectionTool.js";
import { createFileToolsWithEvents } from "./tools/fileToolsWithEvents.js";
import { loadAgentCatalog, loadAgentPromptById } from "./bookkit/agentCatalog.js";
import { getBookLayout } from "../bookLayout.js";

async function ensureRequirementsScaffold(layout: ReturnType<typeof getBookLayout>): Promise<void> {
  // Our app stores everything per-book under books/<bookId>/requirements and books/<bookId>/book.
  // Create a minimal scaffold so agents can read/write predictable files.

  const requiredDirs = [
    path.resolve(layout.requirementsDir, "canon"),
    path.resolve(layout.requirementsDir, "chapter_briefs"),
    path.resolve(layout.requirementsDir, "session_log"),
  ];

  await Promise.all(requiredDirs.map((d) => fs.mkdir(d, { recursive: true })));

  const writeIfMissing = async (absPath: string, content: string) => {
    try {
      await fs.access(absPath);
      return;
    } catch {
      // continue
    }
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, "utf8");
  };

  // Minimal placeholders so the agents can read something real.
  await writeIfMissing(
    path.resolve(layout.requirementsDir, "README.md"),
    [
      "# Book requirements (Copilot Book Writer)",
      "",
      "This folder contains planning/requirements files for this specific book.",
      "",
      "## Where writing goes",
      "- Draft chapters live in: `books/" + layout.bookId + "/book/`",
      "- Planning/specs live in: `books/" + layout.bookId + "/requirements/`",
      "",
    ].join("\n"),
  );

  await writeIfMissing(
    path.resolve(layout.requirementsDir, "workflow.md"),
    [
      "# Workflow", "",
      "1. Capture requirements and constraints", 
      "2. Produce an outline", 
      "3. Draft chapters in `books/" + layout.bookId + "/book/`", 
      "4. Iterate: revise outline/requirements as the manuscript changes", "",
    ].join("\n"),
  );

  await writeIfMissing(
    path.resolve(layout.requirementsDir, "truth-hierarchy.md"),
    [
      "# Truth hierarchy", "",
      "When conflicts happen:",
      "1. The manuscript (files in `books/" + layout.bookId + "/book/`) wins", 
      "2. Then the outline/requirements", 
      "3. Then notes/suggestions", "",
    ].join("\n"),
  );

  await writeIfMissing(
    path.resolve(layout.requirementsDir, "file-specs.md"),
    [
      "# File specs", "",
      "- `books/" + layout.bookId + "/requirements/`: planning, outline, canon, briefs", 
      "- `books/" + layout.bookId + "/book/`: draft chapters (markdown)", "",
    ].join("\n"),
  );

  // Common planning files (optional, but helps the agent do the right thing).
  await writeIfMissing(path.resolve(layout.requirementsDir, "brief.md"), "# Brief\n");
  await writeIfMissing(path.resolve(layout.requirementsDir, "goals.md"), "# Goals\n");
  await writeIfMissing(path.resolve(layout.requirementsDir, "constraints.md"), "# Constraints\n");
  await writeIfMissing(path.resolve(layout.requirementsDir, "audience.md"), "# Audience\n");
  await writeIfMissing(path.resolve(layout.requirementsDir, "style.md"), "# Style\n");
  await writeIfMissing(path.resolve(layout.requirementsDir, "outline.md"), "# Outline\n");
  await writeIfMissing(path.resolve(layout.requirementsDir, "facts.md"), "# Facts\n");
  await writeIfMissing(path.resolve(layout.requirementsDir, "glossary.md"), "# Glossary\n");
  await writeIfMissing(path.resolve(layout.requirementsDir, "context.md"), "# Context\n");
  await writeIfMissing(path.resolve(layout.requirementsDir, "state.md"), "# State\n");
  await writeIfMissing(path.resolve(layout.requirementsDir, "session_plan.md"), "# Session plan\n");
}

function adaptAgentPrompt(prompt: string, bookId: string): string {
  // The agent prompts are written in repo-relative shorthand.
  // In this app, all book-specific files live under books/<bookId>/requirements and books/<bookId>/book.
  // We both:
  // 1) add a short preamble so the model knows the mapping
  // 2) rewrite the most common referenced paths so the prompt is immediately actionable.

  const preamble = [
    "# Copilot Book Writer path mapping (important)",
    "", 
    "You are working on a single book stored under:",
    `- Requirements: \`books/${bookId}/requirements/\``,
    `- Draft manuscript: \`books/${bookId}/book/\``,
    "",
    "When the agent prompt mentions shorthand paths, interpret them as:",
    `- \`brief.md\` → \`books/${bookId}/requirements/brief.md\``,
    `- \`goals.md\` → \`books/${bookId}/requirements/goals.md\``,
    `- \`constraints.md\` → \`books/${bookId}/requirements/constraints.md\``,
    `- \`audience.md\` → \`books/${bookId}/requirements/audience.md\``,
    `- \`state.md\` → \`books/${bookId}/requirements/state.md\``,
    `- \`outline.md\` → \`books/${bookId}/requirements/outline.md\``,
    `- \`style.md\` → \`books/${bookId}/requirements/style.md\``,
    `- \`facts.md\` → \`books/${bookId}/requirements/facts.md\``,
    `- \`glossary.md\` → \`books/${bookId}/requirements/glossary.md\``,
    `- \`context.md\` → \`books/${bookId}/requirements/context.md\``,
    `- \`session_plan.md\` → \`books/${bookId}/requirements/session_plan.md\``,
    `- \`canon/\` → \`books/${bookId}/requirements/canon/\``,
    `- \`chapter_briefs/\` → \`books/${bookId}/requirements/chapter_briefs/\``,
    `- \`session_log/\` → \`books/${bookId}/requirements/session_log/\``,
    `- \`book/\` → \`books/${bookId}/book/\``,
    "",
    "Only use the file tools on paths under those two roots.",
    "",
  ].join("\n");

  const replacements: Array<[string, string]> = [
    // Inputs (read)
    ["`README.md`", "`books/" + bookId + "/requirements/README.md`"],
    ["`docs/workflow.md`", "`books/" + bookId + "/requirements/workflow.md`"],
    ["`docs/truth-hierarchy.md`", "`books/" + bookId + "/requirements/truth-hierarchy.md`"],
    ["`docs/file-specs.md`", "`books/" + bookId + "/requirements/file-specs.md`"],

    // Common planning files
    ["`brief.md`", "`books/" + bookId + "/requirements/brief.md`"],
    ["`goals.md`", "`books/" + bookId + "/requirements/goals.md`"],
    ["`constraints.md`", "`books/" + bookId + "/requirements/constraints.md`"],
    ["`audience.md`", "`books/" + bookId + "/requirements/audience.md`"],
    ["`constitution.md`", "`books/" + bookId + "/requirements/constitution.md`"],
    ["`style.md`", "`books/" + bookId + "/requirements/style.md`"],
    ["`outline.md`", "`books/" + bookId + "/requirements/outline.md`"],
    ["`beats.md`", "`books/" + bookId + "/requirements/beats.md`"],
    ["`state.md`", "`books/" + bookId + "/requirements/state.md`"],
    ["`context_pack.md`", "`books/" + bookId + "/requirements/context_pack.md`"],
    ["`facts.md`", "`books/" + bookId + "/requirements/facts.md`"],
    ["`glossary.md`", "`books/" + bookId + "/requirements/glossary.md`"],
    ["`context.md`", "`books/" + bookId + "/requirements/context.md`"],
    ["`session_plan.md`", "`books/" + bookId + "/requirements/session_plan.md`"],

    // Directories
    ["`canon/`", "`books/" + bookId + "/requirements/canon/`"],
    ["`chapter_briefs/`", "`books/" + bookId + "/requirements/chapter_briefs/`"],
    ["`structured/`", "`books/" + bookId + "/requirements/structured/`"],
    ["`session_log/`", "`books/" + bookId + "/requirements/session_log/`"],
    ["`manuscript/`", "`books/" + bookId + "/book/`"],
    ["`book/NN.md`", "`books/" + bookId + "/book/NN.md`"],
    ["`book/`", "`books/" + bookId + "/book/`"],
    ["`chapter_briefs/NN.md`", "`books/" + bookId + "/requirements/chapter_briefs/NN.md`"],
    ["`session_log/YYYY-MM-DD.md`", "`books/" + bookId + "/requirements/session_log/YYYY-MM-DD.md`"],
  ];

  let rewritten = prompt;
  for (const [from, to] of replacements) {
    rewritten = rewritten.split(from).join(to);
  }

  return `${preamble}${rewritten}`;
}

type Subscriber = (evt: ServerEvent) => void;

type PendingAsk = {
  askId: string;
  resolve: (answers: AskQuestionsAnswerPayload) => void;
  reject: (err: Error) => void;
};

type SessionState = {
  id: string;
  bookId: string;
  model: string;
  continuedFromSessionId?: string;
  session: CopilotSession;
  subscribers: Set<Subscriber>;
  selectedAgentId?: string;
  pendingAsk?: PendingAsk;
  // Each time we call session.send(...), Copilot SDK will emit a "user.message".
  // We keep a queue so we can display the sent content with the right label.
  pendingSentMessages: Array<{ role: "user" | "system"; content: string }>;
  started?: boolean;
  eventLogPath: string;
  metaPath: string;
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

    // Fire-and-forget persistence of events (used for reload/replay).
    void this.appendEventLog(s, evt);

    for (const sub of s.subscribers) sub(evt);
  }

  private buildSessionInfoPayload(id: string): SessionInfoPayload {
    const s = this.sessions.get(id);
    if (!s) return { exists: false };
    return {
      exists: true,
      started: !!s.started,
      bookId: s.bookId,
      model: s.model,
      pendingAsk: !!s.pendingAsk,
      pendingAskId: s.pendingAsk?.askId ?? null,
    };
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
    bookId: string,
    model?: string,
    continuedFromSessionId?: string,
  ): Promise<{ sessionId: string; bookId: string; model: string }> {
    const id = crypto.randomUUID();

    const layout = getBookLayout(this.repoRoot, bookId);
    await fs.mkdir(layout.requirementsDir, { recursive: true });
    await fs.mkdir(layout.draftDir, { recursive: true });
    await fs.mkdir(layout.sessionsDir, { recursive: true });

    await ensureRequirementsScaffold(layout);

    const broker = {
      ask: async (payload: AskQuestionsPayload): Promise<AskQuestionsAnswerPayload> => {
        if (this.sessions.get(id)?.pendingAsk) {
          throw new Error("Already waiting for answers");
        }

        return await new Promise<AskQuestionsAnswerPayload>((resolve, reject) => {
          const s = this.sessions.get(id);
          if (!s) {
            reject(new Error("Session not found"));
            return;
          }

          const askId = crypto.randomUUID();
          s.pendingAsk = { askId, resolve, reject };

          this.emit(id, { type: "session.info", data: this.buildSessionInfoPayload(id) });
          this.emit(id, { type: "ask_questions", data: { askId, ...payload } });
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

    const agentSelectionTool = createAgentSelectionTool(this.repoRoot, {
      select: async (agentId: string) => {
        const s = this.sessions.get(id);
        if (!s) return;
        s.selectedAgentId = agentId;
        this.emit(id, { type: "agent.selected", data: { agentId } });

        const agentPrompt = await loadAgentPromptById(this.repoRoot, agentId);
        if (agentPrompt?.prompt?.trim()) {
          const adapted = adaptAgentPrompt(agentPrompt.prompt.trim(), s.bookId);
          // Show the prompt block as a system message in the UI.
          s.pendingSentMessages.push({ role: "system", content: adapted });
          // Enqueue the next agent prompt so the model continues immediately.
          await s.session.send({ prompt: adapted, mode: "enqueue" });
        }
      },
    });

    const systemMessage = `
You are Copilot running inside a writing UI.

Important:
- The UI may prepend an "agent prompt" block to a user message, then a separator, then "USER_MESSAGE:".
- Treat the agent prompt block as instructions for how to respond for that message.
- If you need to change agents, call the select_agent tool with the next agent id.

Tools:
- ask_questions (ask the user questions)
- select_agent (switch to a different agent)
- read_text_file/write_text_file/append_text_file/list_files (read/write files under books/${layout.bookId}/requirements/ and books/${layout.bookId}/book/)

Keep responses user-facing and concise.
    `.trim();

    const chosenModel = model || this.modelDefault;

    const session = await this.client.createSession({
      model: chosenModel,
      streaming: true,
      tools: [askQuestionsTool, agentSelectionTool, ...fileTools],
      systemMessage: { content: systemMessage },
    });

    const state: SessionState = {
      id,
      bookId: layout.bookId,
      model: chosenModel,
      continuedFromSessionId,
      session,
      subscribers: new Set(),
      started: false,
      pendingSentMessages: [],
      eventLogPath: path.resolve(layout.sessionsDir, `${id}.jsonl`),
      metaPath: path.resolve(layout.sessionsDir, `${id}.meta.json`),
    };

    this.sessions.set(id, state);

    // Persist small metadata so we can list/continue sessions even after reload.
    try {
      await fs.writeFile(
        state.metaPath,
        JSON.stringify(
          {
            sessionId: state.id,
            bookId: state.bookId,
            createdAt: new Date().toISOString(),
            model: state.model,
            continuedFromSessionId: state.continuedFromSessionId || null,
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch {
      // ignore
    }

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
            const s = this.sessions.get(id);
            const next = s?.pendingSentMessages.shift();
            if (next) {
              if (next.role === "system") {
                this.emit(id, { type: "system.message", data: { content: next.content } });
              } else {
                this.emit(id, { type: "user.message", data: { content: next.content } });
              }
              return;
            }

            // Fallback: if we didn't enqueue anything, treat it as a user message.
            this.emit(id, { type: "user.message", data: { content } });
          }
        }
      } catch (err: any) {
        this.emit(id, { type: "error", data: { message: err?.message || String(err) } });
      }
    });

    this.emit(id, { type: "status", data: { message: "session_created" } });

    return { sessionId: id, bookId: layout.bookId, model: chosenModel };
  }

  async continueSession(
    bookId: string,
    fromSessionId: string,
  ): Promise<{ sessionId: string; bookId: string; model: string }> {
    const layout = getBookLayout(this.repoRoot, bookId);
    const metaPath = path.resolve(layout.sessionsDir, `${fromSessionId}.meta.json`);
    let model: string | undefined;

    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed?.model === "string" && parsed.model.trim()) model = parsed.model;
    } catch {
      // fall back to defaults
    }

    return await this.createSession(bookId, model, fromSessionId);
  }

  async getBookContext(bookId: string): Promise<{ requirements: string; book: string }> {
    const layout = getBookLayout(this.repoRoot, bookId);

    const readAllFiles = async (dirAbs: string, prefix: string) => {
      try {
        const entries = await fs.readdir(dirAbs, { withFileTypes: true });
        const files = entries
          .filter((e) => e.isFile())
          .map((e) => e.name)
          .filter((n) => n.endsWith(".md") || n.endsWith(".txt"))
          .sort();
        const parts: string[] = [];
        for (const f of files) {
          const abs = path.resolve(dirAbs, f);
          const content = await fs.readFile(abs, "utf8");
          parts.push(`\n\n---\n\n# ${prefix}/${f}\n\n${content.trim()}\n`);
        }
        return parts.join("");
      } catch {
        return "";
      }
    };

    return {
      requirements: await readAllFiles(layout.requirementsDir, `books/${layout.bookId}/requirements`),
      book: await readAllFiles(layout.draftDir, `books/${layout.bookId}/book`),
    };
  }

  async getSessionLogText(bookId: string, sessionId: string): Promise<string> {
    const layout = getBookLayout(this.repoRoot, bookId);
    const logPath = path.resolve(layout.sessionsDir, `${sessionId}.jsonl`);
    try {
      const raw = await fs.readFile(logPath, "utf8");
      // For now: keep it simple and return the raw log. Later we can summarize.
      return raw.trim();
    } catch {
      return "";
    }
  }

  async startSession(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) throw new Error("Unknown session");
    if (s.started) return;

    s.started = true;

    // Auto-select the first agent (initialize/bootstrapper) and use its prompt
    const catalog = await loadAgentCatalog(this.repoRoot);
    const firstAgent = catalog.agents[0];

    if (firstAgent) {
      s.selectedAgentId = firstAgent.id;
      this.emit(id, { type: "agent.selected", data: { agentId: firstAgent.id } });

      const agentPrompt = await loadAgentPromptById(this.repoRoot, firstAgent.id);
      if (agentPrompt?.prompt?.trim()) {
        const adapted = adaptAgentPrompt(agentPrompt.prompt.trim(), s.bookId);
        s.pendingSentMessages.push({ role: "system", content: adapted });
        await s.session.send({ prompt: adapted, mode: "enqueue" });
        return;
      }
    }

    // Fallback if no agents found
    s.pendingSentMessages.push({
      role: "system",
      content: "Start the writing workflow. Use ask_questions to gather information from the user.",
    });
    await s.session.send({
      prompt: "Start the writing workflow. Use ask_questions to gather information from the user.",
      mode: "enqueue",
    });
  }

  getSessionInfo(id: string): {
    exists: boolean;
    started?: boolean;
    bookId?: string;
    model?: string;
    pendingAsk?: boolean;
    pendingAskId?: string | null;
  } {
    return this.buildSessionInfoPayload(id);
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

  async sendMessage(id: string, prompt: string, agentId?: string): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) throw new Error("Unknown session");

    // Ensure the UI shows the user's actual message (not the decorated agent prompt wrapper).
    s.pendingSentMessages.push({ role: "user", content: prompt });

    const effectiveAgentId = agentId || s.selectedAgentId;

    if (effectiveAgentId) {
      const agentPrompt = await loadAgentPromptById(this.repoRoot, effectiveAgentId);
      if (agentPrompt?.prompt?.trim()) {
        const adapted = adaptAgentPrompt(agentPrompt.prompt.trim(), s.bookId);
        const decoratedPrompt = `${adapted}\n\n---\n\nUSER_MESSAGE:\n${prompt}`;
        await s.session.send({ prompt: decoratedPrompt, mode: "enqueue" });
        return;
      }
    }

    await s.session.send({ prompt, mode: "enqueue" });
  }

  answerQuestions(id: string, answers: AskQuestionsAnswerPayload, askId?: string): void {
    const s = this.sessions.get(id);
    if (!s) throw new Error("Unknown session");
    if (!s.pendingAsk) throw new Error("No pending questions");

    if (askId && s.pendingAsk.askId !== askId) {
      throw new Error("No pending questions");
    }

    this.emit(id, {
      type: "ask_questions.answered",
      data: { askId: s.pendingAsk.askId, answers },
    });

    s.pendingAsk.resolve(answers);
    s.pendingAsk = undefined;

    this.emit(id, { type: "session.info", data: this.buildSessionInfoPayload(id) });
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
