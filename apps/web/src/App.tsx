import * as React from "react";

import type { AgentMode, BookKitStatus, ServerEvent } from "./api";
import {
  continueSession,
  createBook,
  getBookKitStatus,
  getSessionInfo,
  listBookKitAgents,
  listBookFiles,
  listBooks,
  listSessions,
  readBookFile,
  startBookSession,
  startSession,
  sendAnswers,
  sendMessage,
} from "./api";
import { AskQuestionsCard } from "./components/AskQuestionsCard";
import { CollapsibleMarkdown } from "./components/CollapsibleMarkdown";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { Separator } from "./components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
import { Textarea } from "./components/ui/textarea";
import { Loader2, RefreshCw } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessage = { role: "user" | "assistant" | "system" | "error"; content: string };

function looksLikeAgentPromptDump(text: string): boolean {
  const t = text.toLowerCase();
  // Heuristics: our injected agent prompts include this mapping header and/or spec-y sections.
  if (t.includes("copilot book writer path mapping")) return true;
  if (t.includes("## allowed writes")) return true;
  if (t.includes("## required outputs")) return true;
  if (t.includes("validation checklist")) return true;
  return false;
}

const markdownComponents: Components = {
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-sky-300 underline"
      {...props}
    >
      {children}
    </a>
  ),
  code: ({ inline, className, children, ...props }: any) => {
    if (inline) {
      return (
        <code
          className="rounded bg-slate-900/60 px-1.5 py-0.5 text-[0.85em]"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <pre className="overflow-auto rounded-md bg-slate-950/60 p-3">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    );
  },
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-slate-700 pl-3 text-slate-300"
      {...props}
    >
      {children}
    </blockquote>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-5" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-5" {...props}>
      {children}
    </ol>
  ),
  table: ({ children, ...props }) => (
    <div className="overflow-auto">
      <table className="w-full border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th className="border border-slate-700 px-2 py-1 text-left" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-slate-800 px-2 py-1" {...props}>
      {children}
    </td>
  ),
};

const inlineMarkdownComponents: Components = {
  ...markdownComponents,
  p: ({ children }) => <span>{children}</span>,
};

function tagClasses(tag: string): string {
  const t = tag.toLowerCase();
  if (t === "status") return "bg-sky-900/60 text-sky-200 border-sky-800";
  if (t === "error") return "bg-red-900/60 text-red-200 border-red-800";
  if (t === "questions") return "bg-amber-900/60 text-amber-200 border-amber-800";
  if (t === "file") return "bg-emerald-900/60 text-emerald-200 border-emerald-800";
  if (t === "agent") return "bg-violet-900/60 text-violet-200 border-violet-800";
  if (t === "system") return "bg-slate-800/60 text-slate-200 border-slate-700";
  if (t === "you") return "bg-slate-700/60 text-slate-100 border-slate-600";
  return "bg-slate-800/40 text-slate-200 border-slate-700";
}

type RollingSegment =
  | { kind: "markdown"; text: string }
  | { kind: "tagline"; tag: string; text: string };

function buildRollingSegments(text: string): RollingSegment[] {
  const lines = text.split("\n");
  const segments: RollingSegment[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (!buffer.length) return;
    segments.push({ kind: "markdown", text: buffer.join("\n") });
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (match) {
      flush();
      segments.push({ kind: "tagline", tag: match[1], text: match[2] || "" });
      continue;
    }
    buffer.push(line);
  }

  flush();
  return segments;
}

export function App() {
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string>("idle");
  const [activeModel, setActiveModel] = React.useState<string>("");
  const [chat, setChat] = React.useState<ChatMessage[]>([]);
  const [rollingOutput, setRollingOutput] = React.useState<string>("");
  const [streamBuffer, setStreamBuffer] = React.useState<string>("");
  const [hasStarted, setHasStarted] = React.useState(false);

  const [bookKitStatus, setBookKitStatus] = React.useState<BookKitStatus | null>(null);
  const [bookKitError, setBookKitError] = React.useState<string | null>(null);
  const [agentCatalog, setAgentCatalog] = React.useState<AgentMode[]>([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string>("");

  const [books, setBooks] = React.useState<string[]>([]);
  const [activeBookId, setActiveBookId] = React.useState<string>("");
  const [bookName, setBookName] = React.useState<string>("");
  const [resume, setResume] = React.useState<
    { sessionId: string; bookId: string } | undefined
  >();
  const [questionHistory, setQuestionHistory] = React.useState<
    Array<{
      id: string;
      askId: string;
      questions: Array<{
        header: string;
        question: string;
        multiSelect?: boolean;
        options?: Array<{ label: string; description?: string }>;
      }>;
      answers?: Record<string, string | string[]>;
      status: "pending" | "submitting" | "submitted" | "expired" | "error";
      error?: string;
    }>
  >([]);

  const [input, setInput] = React.useState<string>("");
  const [isSending, setIsSending] = React.useState(false);

  const [bookFiles, setBookFiles] = React.useState<string[]>([]);
  const [activeFile, setActiveFile] = React.useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = React.useState<string>("");

  const [sessions, setSessions] = React.useState<
    Array<{
      sessionId: string;
      createdAt: string;
      continuedFromSessionId?: string | null;
      model?: string;
    }>
  >([]);

  const chatEndRef = React.useRef<HTMLDivElement | null>(null);

  const esRef = React.useRef<EventSource | null>(null);
  const isReplayingRef = React.useRef<boolean>(false);
  const pendingAskIdRef = React.useRef<string | null>(null);

  const rollingContainerRef = React.useRef<HTMLDivElement | null>(null);
  const rollingPinnedToBottomRef = React.useRef<boolean>(true);

  const updateRollingPinnedState = React.useCallback(() => {
    const el = rollingContainerRef.current;
    if (!el) return;
    // "Near bottom" threshold so we don't flicker pinned/unpinned.
    const thresholdPx = 24;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - thresholdPx;
    rollingPinnedToBottomRef.current = atBottom;
  }, []);

  const scrollRollingToBottom = React.useCallback(() => {
    const el = rollingContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const maybeAutoScrollRolling = React.useCallback(() => {
    if (!rollingPinnedToBottomRef.current) return;
    // Wait for React to paint before scrolling.
    requestAnimationFrame(() => {
      scrollRollingToBottom();
    });
  }, [scrollRollingToBottom]);

  function disconnectStream() {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }

  function resetUiForBookSwitch(nextBookId: string) {
    disconnectStream();
    setSessionId(null);
    setHasStarted(false);
    setStatus("idle");
    setActiveModel("");
    setChat([]);
    setRollingOutput("");
    setStreamBuffer("");
    setQuestionHistory([]);
    setActiveBookId(nextBookId);
    setBookFiles([]);
    setActiveFile(null);
    setActiveFileContent("");
  }

  async function refreshBookList(bookId: string = activeBookId) {
    if (!bookId) return;
    try {
      const files = await listBookFiles(bookId);
      setBookFiles(files);
      if (!files.length) {
        setActiveFile(null);
        setActiveFileContent("");
        return;
      }

      if (!activeFile) {
        setActiveFile(files[0]);
        return;
      }

      if (!files.includes(activeFile)) {
        setActiveFile(files[0]);
      }
    } catch {
      // ignore until files exist
    }
  }

  async function refreshActiveFile(name: string, bookId: string = activeBookId) {
    if (!bookId) {
      setActiveFileContent("");
      return;
    }
    try {
      const content = await readBookFile(bookId, name);
      setActiveFileContent(content);
    } catch (err: any) {
      setActiveFileContent(String(err?.message || err));
    }
  }

  React.useEffect(() => {
    document.documentElement.classList.add("dark");

    // Load known books + any last session so the user can resume after reload.
    const raw = localStorage.getItem("cbw:lastSession");
    let resumeCandidate: { sessionId: string; bookId: string } | undefined;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.sessionId && parsed?.bookId) {
          resumeCandidate = {
            sessionId: String(parsed.sessionId),
            bookId: String(parsed.bookId),
          };
          setResume(resumeCandidate);
        }
      } catch {
        // ignore
      }
    }

    void (async () => {
      try {
        const b = await listBooks();
        setBooks(b);
        if (resumeCandidate && b.includes(resumeCandidate.bookId)) {
          setActiveBookId(resumeCandidate.bookId);
        } else if (b.length) {
          setActiveBookId(b[0]);
        } else {
          setActiveBookId("");
        }

        setResume((current) => {
          if (!current) return current;
          if (b.includes(current.bookId)) return current;
          localStorage.removeItem("cbw:lastSession");
          return undefined;
        });
      } catch {
        // ignore
      }
    })();

    void (async () => {
      try {
        const status = await getBookKitStatus();
        setBookKitStatus(status);
        if (!status.ok) {
          setBookKitError(status.error || "BookKit agents are not available");
        }
      } catch (err: any) {
        setBookKitStatus({ ok: false, error: String(err?.message || err) });
        setBookKitError(String(err?.message || err));
      }

      try {
        const catalog = await listBookKitAgents();
        setAgentCatalog(catalog.agents || []);
        if (!selectedAgentId) {
          const nextDefault = catalog.defaultAgentId || catalog.agents?.[0]?.id || "";
          setSelectedAgentId(nextDefault);
        }
      } catch (err: any) {
        setBookKitError(String(err?.message || err));
      }
    })();

    return () => {
      disconnectStream();
    };
  }, []);

  React.useEffect(() => {
    if (!resume || hasStarted) return;
    void handleResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, hasStarted]);

  function connectStream(bookId: string, sessionId: string) {
    disconnectStream();
    isReplayingRef.current = false;
    // On session load, default to pinned-to-bottom behavior.
    rollingPinnedToBottomRef.current = true;
    // If we already have content (e.g. switching sessions), snap to bottom.
    requestAnimationFrame(() => requestAnimationFrame(() => scrollRollingToBottom()));
    const es = new EventSource(`/api/books/${bookId}/sessions/${sessionId}/events`);
    esRef.current = es;

    const appendRolling = (line: string) => {
      const cleaned = line.trim();
      if (!cleaned) return;
      setRollingOutput((prev) => {
        const next = prev + (prev.trim().length ? "\n" : "") + cleaned;
        return next;
      });
    };

    es.addEventListener("event", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as ServerEvent;

      if (data.type === "replay") {
        isReplayingRef.current = data.data.phase === "begin";
        if (data.data.phase === "end") {
          // After replay finishes, snap to bottom once (unless user has scrolled up).
          maybeAutoScrollRolling();
        }
        return;
      }

      if (data.type === "session.info") {
        pendingAskIdRef.current = data.data.pendingAskId ?? null;
        if (!data.data.exists) {
          setStatus("session_offline");
        }
        return;
      }

      if (data.type === "status") {
        setStatus(data.data.message);
        if (data.data.message !== "connected") {
          appendRolling(`[status] ${data.data.message}`);
        }
        maybeAutoScrollRolling();
        return;
      }

      if (data.type === "error") {
        setChat((prev) => [...prev, { role: "error", content: data.data.message }]);
        appendRolling(`[error] ${data.data.message}`);
        maybeAutoScrollRolling();
        return;
      }

      if (data.type === "system.message") {
        setChat((prev) => [...prev, { role: "system", content: data.data.content }]);
        appendRolling(`[system] ${data.data.content}`);
        maybeAutoScrollRolling();
        return;
      }

      if (data.type === "ask_questions") {
        const pendingAskId = pendingAskIdRef.current;
        const isPendingFromSession = Boolean(pendingAskId) && data.data.askId === pendingAskId;

        const entry = {
          id: crypto.randomUUID(),
          askId: data.data.askId,
          questions: data.data.questions,
          status: (isReplayingRef.current
            ? isPendingFromSession
              ? "pending"
              : "expired"
            : "pending") as ("expired" | "pending"),
        };

        setQuestionHistory((prev) => {
          // If we're replaying history but the session is *currently* waiting on this askId,
          // treat it like a live pending card (actionable).
          if (isReplayingRef.current && !isPendingFromSession) return prev.concat(entry);

          // Live questions: supersede older pending cards.
          return prev
            .map((q) =>
              q.status === "pending" || q.status === "submitting"
                ? {
                    ...q,
                    status: "error" as const,
                    error: "Superseded by newer questions.",
                  }
                : q,
            )
            .concat(entry);
        });

        if (!isReplayingRef.current || isPendingFromSession) {
          appendRolling(`[questions] Copilot asked for input.`);
          maybeAutoScrollRolling();
        }
        return;
      }

      if (data.type === "ask_questions.answered") {
        setQuestionHistory((prev) =>
          prev.map((q) =>
            q.askId === data.data.askId
              ? {
                  ...q,
                  status: "submitted" as const,
                  answers: data.data.answers.answers,
                  error: undefined,
                }
              : q,
          ),
        );
        maybeAutoScrollRolling();
        return;
      }

      if (data.type === "assistant.delta") {
        setStreamBuffer((prev) => prev + data.data.delta);
        maybeAutoScrollRolling();
        return;
      }

      if (data.type === "assistant.message") {
        // Commit the streamed buffer if present; otherwise fall back to the final content.
        setStreamBuffer((buf) => {
          const chunk = buf.trim().length ? buf : data.data.content;
          setRollingOutput((prev) => {
            const next = prev + (prev.trim().length ? "\n\n" : "") + chunk.trim();
            return next;
          });
          return "";
        });
        maybeAutoScrollRolling();
        return;
      }

      if (data.type === "user.message") {
        setChat((prev) => [...prev, { role: "user", content: data.data.content }]);
        appendRolling(`[you] ${data.data.content}`);
        maybeAutoScrollRolling();
        return;
      }

      if (data.type === "file.updated") {
        refreshBookList(bookId);
        if (activeFile && data.data.path === `books/${bookId}/book/${activeFile}`) {
          refreshActiveFile(activeFile, bookId);
        }
        appendRolling(`[file] updated ${data.data.path}`);
        maybeAutoScrollRolling();
        return;
      }

      if (data.type === "agent.selected") {
        setSelectedAgentId(data.data.agentId);
        appendRolling(`[agent] switched to ${data.data.agentId}`);
        maybeAutoScrollRolling();
        return;
      }
    });

    es.onerror = () => {
      setStatus("disconnected");
    };
  }

  async function handleStart() {
    if (hasStarted) return;

    setHasStarted(true);
    setStatus("creating session...");

    try {
      const trimmedName = bookName.trim();

      // Starting requires either:
      // - a typed name (create a new book), OR
      // - an existing selected book.
      if (!trimmedName && !activeBookId) {
        throw new Error("Please enter a book name to start.");
      }

      let bookId = activeBookId;

      if (trimmedName) {
        const createdBook = await createBook(trimmedName);
        bookId = createdBook.bookId;
      }

      try {
        setBooks(await listBooks());
      } catch {
        // ignore
      }

      const created = await startBookSession(bookId);

      setActiveBookId(bookId);
      setSessionId(created.sessionId);
      setActiveModel(created.model || "");
      setStatus("session created");

      if (trimmedName) setBookName("");

      localStorage.setItem(
        "cbw:lastSession",
        JSON.stringify({ sessionId: created.sessionId, bookId: created.bookId }),
      );

      connectStream(created.bookId, created.sessionId);
      await refreshBookList(created.bookId);

      // Now that the UI is connected and mode is deterministic, start Copilot.
      await startSession(created.sessionId);
      setStatus("running");
    } catch (err: any) {
      setStatus("failed");
      setChat([{ role: "system", content: String(err?.message || err) }]);
      setHasStarted(false);
    }
  }

  async function handleResume() {
    if (!resume) return;
    resetUiForBookSwitch(resume.bookId);
    setHasStarted(true);
    setSessionId(resume.sessionId);
    setStatus("resuming...");

    try {
      const info = await getSessionInfo(resume.sessionId);
      if (!info.exists) {
        setStatus("session_offline");
        setResume(undefined);
        localStorage.removeItem("cbw:lastSession");
        return;
      }
      setActiveModel(info.model || "");
      setStatus("connected");
    } catch {
      setStatus("session_offline");
      setResume(undefined);
      localStorage.removeItem("cbw:lastSession");
      return;
    }

    connectStream(resume.bookId, resume.sessionId);
    await refreshBookList(resume.bookId);
  }

  React.useEffect(() => {
    if (!activeFile) return;
    refreshActiveFile(activeFile, activeBookId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, activeBookId]);

  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, questionHistory, hasStarted]);

  React.useEffect(() => {
    // When switching books, refresh the chapter list.
    if (!activeBookId) {
      setSessions([]);
      setBookFiles([]);
      setActiveFile(null);
      setActiveFileContent("");
      return;
    }

    void refreshBookList();
    void (async () => {
      try {
        const s = await listSessions(activeBookId);
        setSessions(
          s.map((x) => ({
            sessionId: x.sessionId,
            createdAt: x.createdAt,
            continuedFromSessionId: x.continuedFromSessionId,
            model: x.model,
          })),
        );
      } catch {
        setSessions([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBookId]);

  async function handleViewSession(bookId: string, sessionId: string) {
    resetUiForBookSwitch(bookId);
    setHasStarted(true);
    setSessionId(sessionId);
    setActiveModel(sessions.find((s) => s.sessionId === sessionId)?.model || "");
    setStatus("connected");
    connectStream(bookId, sessionId);
    await refreshBookList(bookId);
  }

  async function handleContinueFrom(bookId: string, fromSessionId: string) {
    setStatus("continuing...");
    const created = await continueSession(bookId, fromSessionId);
    localStorage.setItem(
      "cbw:lastSession",
      JSON.stringify({ sessionId: created.sessionId, bookId: created.bookId }),
    );
    setResume({ sessionId: created.sessionId, bookId: created.bookId });
    setSessionId(created.sessionId);
    setActiveModel(created.model || "");
    setHasStarted(true);
    connectStream(created.bookId, created.sessionId);
    await refreshBookList(created.bookId);
    await startSession(created.sessionId);
    try {
      setSessions(
        (await listSessions(created.bookId)).map((x) => ({
          sessionId: x.sessionId,
          createdAt: x.createdAt,
          continuedFromSessionId: x.continuedFromSessionId,
          model: x.model,
        })),
      );
    } catch {
      // ignore
    }
    setStatus("running");
  }

  async function handleSend() {
    if (!sessionId) return;
    const prompt = input.trim();
    if (!prompt) return;

    setIsSending(true);
    try {
      await sendMessage(sessionId, prompt, selectedAgentId || undefined);
      setInput("");
    } finally {
      setIsSending(false);
    }
  }

  async function handleSubmitAnswers(answers: Record<string, string | string[]>) {
    if (!sessionId) return;
    let active: (typeof questionHistory)[number] | undefined;
    for (let i = questionHistory.length - 1; i >= 0; i -= 1) {
      if (questionHistory[i].status === "pending") {
        active = questionHistory[i];
        break;
      }
    }
    if (!active) return;

    setQuestionHistory((prev) =>
      prev.map((q) =>
        q.id === active.id ? { ...q, status: "submitting" } : q,
      ),
    );
    setRollingOutput((prev) => {
      const cleaned = "[questions] Submitting answers...";
      return prev.trim().length ? `${prev}\n${cleaned}` : cleaned;
    });

    try {
      await sendAnswers(sessionId, active.askId, answers);
      setQuestionHistory((prev) =>
        prev.map((q) =>
          q.id === active.id
            ? { ...q, status: "submitted", answers }
            : q,
        ),
      );
      setRollingOutput((prev) => {
        const cleaned = "[questions] Answers submitted.";
        return prev.trim().length ? `${prev}\n${cleaned}` : cleaned;
      });
    } catch (err: any) {
      const message = String(err?.message || err);
      const friendly = message.includes("No pending questions")
        ? "These questions are no longer pending. Ask Copilot to re-ask."
        : message;
      setQuestionHistory((prev) =>
        prev.map((q) =>
          q.id === active.id
            ? { ...q, status: "error", error: friendly, answers }
            : q,
        ),
      );
      setChat((prev) => [...prev, { role: "error", content: message }]);
    }
  }

  const activeAgentLabel = React.useMemo(() => {
    return agentCatalog.find((agent) => agent.id === selectedAgentId)?.displayName ||
      "Select agent";
  }, [agentCatalog, selectedAgentId]);

  const activeBookLabel = activeBookId || "Select book";

  const hasChapters = Boolean(activeBookId) && bookFiles.length > 0;
  const activeFileLabel = activeFile || "No chapters";
  const hasPendingQuestions = questionHistory.some(
    (q) => q.status === "pending" || q.status === "submitting",
  );
  const isWorking = isSending || Boolean(streamBuffer.trim());
  const rollingSegments = React.useMemo(() => buildRollingSegments(rollingOutput), [rollingOutput]);

  // Keep rolling output stuck to the bottom while the user hasn't scrolled up.
  React.useEffect(() => {
    maybeAutoScrollRolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollingOutput, streamBuffer]);

  return (
    <div className="h-full">
      <div className="h-full flex">
        {/* Left: chat */}
        <div className="w-[42%] min-w-[360px] border-r border-slate-800 flex flex-col">
          <div className="p-4">
            <div className="text-lg font-semibold">Copilot Book Writer</div>
            <div className="text-xs text-slate-400">Status: {status}</div>
            <div className="text-xs text-slate-500">Model: {activeModel || "-"}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" type="button" disabled={!books.length}>
                    {books.length ? activeBookLabel : "No books"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={activeBookId}
                    onValueChange={(value) => resetUiForBookSwitch(value)}
                  >
                    {books.map((b) => (
                      <DropdownMenuRadioItem key={b} value={b}>
                        {b}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" type="button" disabled={!sessions.length}>
                    {sessions.length ? "Sessions" : "No sessions"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <TooltipProvider>
                    {sessions.map((s) => {
                      const label = s.sessionId;
                      const when = new Date(s.createdAt).toLocaleString();
                      return (
                        <Tooltip key={s.sessionId}>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem
                              onClick={() => handleViewSession(activeBookId, s.sessionId)}
                            >
                              {label}
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="text-xs">
                            {when}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </TooltipProvider>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <Separator />

          <div className="flex-1 overflow-auto p-4 space-y-3">
            {!hasStarted ? (
              <Card className="border-slate-800 bg-slate-950/30">
                <CardHeader>
                  <CardTitle>Start</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-slate-300">
                    Pick a book, then start Copilot.
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-slate-400">Book</div>
                    <div className="flex gap-2">
                      <input
                        className="h-9 flex-1 rounded-md border border-slate-700 bg-slate-950/40 px-3 text-sm"
                        value={bookName}
                        placeholder="Book name"
                        onChange={(e) => setBookName(e.target.value)}
                      />
                    </div>
                    <div className="text-xs text-slate-500">
                      Tip: type a new name to create a new book; or pick an existing one.
                    </div>
                  </div>



                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={handleStart}
                      disabled={!bookName.trim() && !activeBookId}
                    >
                      Start
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {chat
              .filter((m) => m.content.trim().length > 0)
              .map((m, idx) => (
                <Card
                  key={idx}
                  className={
                    m.role === "user"
                      ? "border-slate-700 bg-slate-900/30"
                      : m.role === "assistant"
                        ? "border-slate-800 bg-slate-950/30"
                        : m.role === "system"
                          ? "border-slate-800 bg-slate-950/20"
                          : "border-red-900/40 bg-red-950/20"
                  }
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="capitalize">{m.role}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm leading-6">
                      {m.role === "system" && (m.content.length > 700 || looksLikeAgentPromptDump(m.content)) ? (
                        <CollapsibleMarkdown
                          content={m.content}
                          defaultCollapsed
                          collapsedMaxHeightPx={240}
                          components={markdownComponents}
                        />
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {m.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            {questionHistory.map((entry) => (
              <AskQuestionsCard
                key={entry.id}
                questions={entry.questions}
                onSubmit={
                  entry.status === "pending" || entry.status === "error"
                    ? handleSubmitAnswers
                    : undefined
                }
                initialAnswers={entry.answers}
                disabled={entry.status === "submitting"}
                readOnly={entry.status === "submitted" || entry.status === "expired"}
                status={entry.status}
                errorMessage={entry.error}
              />
            ))}
            <div ref={chatEndRef} />
          </div>

          <Separator />
          <div className="p-4 space-y-2">
            <Textarea
              value={input}
              placeholder="Say something to Copilot..."
              onChange={(e) => setInput(e.target.value)}
              disabled={hasPendingQuestions}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="flex gap-2 items-center justify-end">
              <div className="flex items-center gap-2">
                <div className="text-xs text-slate-400">Agent</div>
                {bookKitError ? (
                  <div className="rounded-md border border-red-900/40 bg-red-950/20 px-2 py-1 text-xs text-red-200">
                    {bookKitError}
                  </div>
                ) : agentCatalog.length ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" type="button">
                        {activeAgentLabel}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup
                        value={selectedAgentId}
                        onValueChange={(value) => setSelectedAgentId(value)}
                      >
                        <TooltipProvider>
                          {agentCatalog.map((agent) => {
                            const description = agent.description?.trim();
                            const item = (
                              <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                                {agent.displayName}
                              </DropdownMenuRadioItem>
                            );

                            if (!description) return item;

                            return (
                              <Tooltip key={agent.id}>
                                <TooltipTrigger asChild>{item}</TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs text-xs">
                                  {description}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </TooltipProvider>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="rounded-md border border-slate-800 bg-slate-950/20 px-2 py-1 text-xs text-slate-400">
                    No agents
                  </div>
                )}
              </div>
              {/*
              <Button
                variant="secondary"
                type="button"
                onClick={() => setChat([])}
                disabled={isSending}
              >
                Clear chat
              </Button>
              */}
              <Button
                type="button"
                onClick={handleSend}
                disabled={isSending || !sessionId || hasPendingQuestions}
              >
                {isWorking ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Working...
                  </span>
                ) : (
                  "Send"
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Right: chapter stream */}
        <div className="flex-1 flex flex-col">
          <div className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Chapter streaming</div>
              <div className="text-xs text-slate-500">
                Live assistant output + current book files
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" type="button" disabled={!hasChapters}>
                    {hasChapters ? activeFileLabel : "No chapters"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {hasChapters ? (
                    bookFiles.map((f) => (
                      <DropdownMenuItem key={f} onClick={() => setActiveFile(f)}>
                        {f}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>No chapters</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => refreshBookList()}
                      className="h-9 w-9 p-0"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Refresh files</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-0 flex-1 min-h-0">
            <div className="border-r border-slate-800 min-h-0 flex flex-col">
              <div className="p-3 text-xs text-slate-400 border-b border-slate-800">
                Rolling output (top → bottom)
              </div>
              <div
                ref={rollingContainerRef}
                className="flex-1 overflow-auto p-4"
                onScroll={updateRollingPinnedState}
              >
                <div className="text-sm leading-6">
                  {rollingOutput || streamBuffer ? (
                    (() => {
                      const rendered = rollingSegments.map((segment, idx) => {
                        if (segment.kind === "tagline") {
                          return (
                            <div key={idx} className="flex items-start gap-2">
                              <span
                                className={
                                  "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold " +
                                  tagClasses(segment.tag)
                                }
                              >
                                [{segment.tag}]
                              </span>
                              <div className="flex-1">
                                {segment.tag.toLowerCase() === "system" &&
                                (segment.text.length > 240 || looksLikeAgentPromptDump(segment.text)) ? (
                                  <CollapsibleMarkdown
                                    content={segment.text || "\u00A0"}
                                    defaultCollapsed
                                    collapsedMaxHeightPx={140}
                                    components={inlineMarkdownComponents}
                                  />
                                ) : (
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={inlineMarkdownComponents}
                                  >
                                    {segment.text || "\u00A0"}
                                  </ReactMarkdown>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // If a huge prompt block got written into rolling output, collapse it by default.
                        if (
                          segment.text.length > 1400 ||
                          looksLikeAgentPromptDump(segment.text)
                        ) {
                          return (
                            <div key={idx} className="whitespace-pre-wrap">
                              <CollapsibleMarkdown
                                content={segment.text || "\u00A0"}
                                defaultCollapsed
                                collapsedMaxHeightPx={240}
                                components={markdownComponents}
                              />
                            </div>
                          );
                        }

                        return (
                          <div key={idx} className="whitespace-pre-wrap">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                              {segment.text || "\u00A0"}
                            </ReactMarkdown>
                          </div>
                        );
                      });

                      if (streamBuffer.trim()) {
                        rendered.push(
                          <div key="stream" className="whitespace-pre-wrap">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                              {streamBuffer}
                            </ReactMarkdown>
                          </div>,
                        );
                      }

                      return rendered;
                    })()
                  ) : (
                    "(not started yet)"
                  )}
                </div>
              </div>
            </div>
            <div className="min-h-0 flex flex-col">
              <div className="p-3 text-xs text-slate-400 border-b border-slate-800">
                {activeFile
                  ? `books/${activeBookId}/book/${activeFile}`
                  : "No chapter selected"}
              </div>
              <div className="flex-1 overflow-auto p-4">
                <pre className="whitespace-pre-wrap text-sm leading-6">
                  {activeFile ? activeFileContent : "(no chapters yet)"}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
