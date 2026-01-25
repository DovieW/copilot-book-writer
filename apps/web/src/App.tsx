import * as React from "react";

import type { ServerEvent } from "./api";
import {
  continueSession,
  createBook,
  createSession,
  getSessionInfo,
  listBookFiles,
  listBooks,
  listSessions,
  readBookFile,
  startSession,
  sendAnswers,
  sendMessage,
} from "./api";
import { AskQuestionsCard } from "./components/AskQuestionsCard";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Separator } from "./components/ui/separator";
import { Textarea } from "./components/ui/textarea";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export function App() {
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string>("idle");
  const [chat, setChat] = React.useState<ChatMessage[]>([]);
  const [rollingOutput, setRollingOutput] = React.useState<string>("");
  const [streamBuffer, setStreamBuffer] = React.useState<string>("");

  const [mode, setMode] = React.useState<"easy" | "hard">("hard");
  const [hasStarted, setHasStarted] = React.useState(false);

  const [books, setBooks] = React.useState<string[]>([]);
  const [activeBookId, setActiveBookId] = React.useState<string>("default");
  const [bookName, setBookName] = React.useState<string>("");
  const [resume, setResume] = React.useState<
    { sessionId: string; bookId: string } | undefined
  >();

  const [pendingQuestions, setPendingQuestions] = React.useState<
    ServerEvent & { type: "ask_questions" }
  >();

  const [input, setInput] = React.useState<string>("");
  const [isSending, setIsSending] = React.useState(false);

  const [bookFiles, setBookFiles] = React.useState<string[]>([]);
  const [activeFile, setActiveFile] = React.useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = React.useState<string>("");

  const [sessions, setSessions] = React.useState<
    Array<{ sessionId: string; createdAt: string; continuedFromSessionId?: string | null }>
  >([]);

  const esRef = React.useRef<EventSource | null>(null);

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
    setChat([]);
    setRollingOutput("");
    setStreamBuffer("");
    setPendingQuestions(undefined);
    setActiveBookId(nextBookId);
    setActiveFile(null);
    setActiveFileContent("");
  }

  async function refreshBookList(bookId: string = activeBookId) {
    try {
      const files = await listBookFiles(bookId);
      setBookFiles(files);
      if (!activeFile && files.length) setActiveFile(files[0]);
    } catch {
      // ignore until files exist
    }
  }

  async function refreshActiveFile(name: string, bookId: string = activeBookId) {
    try {
      const content = await readBookFile(bookId, name);
      setActiveFileContent(content);
    } catch (err: any) {
      setActiveFileContent(String(err?.message || err));
    }
  }

  React.useEffect(() => {
    // Load known books + any last session so the user can resume after reload.
    const raw = localStorage.getItem("cbw:lastSession");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.sessionId && parsed?.bookId) {
          setResume({ sessionId: String(parsed.sessionId), bookId: String(parsed.bookId) });
        }
      } catch {
        // ignore
      }
    }

    void (async () => {
      try {
        const b = await listBooks();
        setBooks(b);
        if (b.includes("default")) setActiveBookId("default");
        else if (b.length) setActiveBookId(b[0]);
      } catch {
        // ignore
      }
    })();

    return () => {
      disconnectStream();
    };
  }, []);

  function connectStream(bookId: string, sessionId: string) {
    disconnectStream();
    const es = new EventSource(`/api/books/${bookId}/sessions/${sessionId}/events`);
    esRef.current = es;

    es.addEventListener("event", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as ServerEvent;

      if (data.type === "status") {
        setStatus(data.data.message);
        return;
      }

      if (data.type === "error") {
        setChat((prev) => [...prev, { role: "system", content: data.data.message }]);
        return;
      }

      if (data.type === "ask_questions") {
        setPendingQuestions(data as any);
        return;
      }

      if (data.type === "assistant.delta") {
        setStreamBuffer((prev) => prev + data.data.delta);
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
        return;
      }

      if (data.type === "user.message") {
        setChat((prev) => [...prev, { role: "user", content: data.data.content }]);
        return;
      }

      if (data.type === "file.updated") {
        refreshBookList(bookId);
        if (activeFile && data.data.path === `books/${bookId}/book/${activeFile}`) {
          refreshActiveFile(activeFile, bookId);
        }
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
      const nameToUse = bookName.trim() || activeBookId || "default";

      // Ensure the book folder exists (nice UX; server also slugifies/creates).
      try {
        await createBook(nameToUse);
      } catch {
        // ignore if it already exists
      }

      try {
        setBooks(await listBooks());
      } catch {
        // ignore
      }

      const created = await createSession(mode, nameToUse);

      setActiveBookId(created.bookId);
      setSessionId(created.sessionId);
      setStatus("session created");

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
      setStatus(info.exists ? "connected" : "session_offline");
    } catch {
      setStatus("session_offline");
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
    // When switching books, refresh the chapter list.
    void refreshBookList();
    void (async () => {
      try {
        const s = await listSessions(activeBookId);
        setSessions(
          s.map((x) => ({
            sessionId: x.sessionId,
            createdAt: x.createdAt,
            continuedFromSessionId: x.continuedFromSessionId,
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
      await sendMessage(sessionId, prompt);
      setInput("");
    } finally {
      setIsSending(false);
    }
  }

  async function handleSubmitAnswers(answers: Record<string, string | string[]>) {
    if (!sessionId) return;
    await sendAnswers(sessionId, answers);
    setPendingQuestions(undefined);
  }

  return (
    <div className="h-full">
      <div className="h-full flex">
        {/* Left: chat */}
        <div className="w-[42%] min-w-[360px] border-r border-slate-800 flex flex-col">
          <div className="p-4">
            <div className="text-lg font-semibold">Copilot Book Writer</div>
            <div className="text-xs text-slate-400">Status: {status}</div>
            <div className="text-xs text-slate-500">Session: {sessionId ?? "-"}</div>
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
                    Choose a mode (deterministic) and then start Copilot.
                  </div>
                  {resume ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/20 p-3">
                      <div className="text-xs text-slate-400">
                        Resume last session: <span className="text-slate-200">{resume.bookId}</span>
                      </div>
                      <Button type="button" variant="secondary" onClick={handleResume}>
                        Resume
                      </Button>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="text-xs text-slate-400">Book</div>
                    <div className="flex gap-2">
                      <input
                        className="h-9 flex-1 rounded-md border border-slate-700 bg-slate-950/40 px-3 text-sm"
                        value={bookName}
                        placeholder="Book name (e.g. My Cool Book)"
                        onChange={(e) => setBookName(e.target.value)}
                      />
                      <select
                        className="h-9 rounded-md border border-slate-700 bg-slate-950/40 px-2 text-sm"
                        value={activeBookId}
                        onChange={(e) => {
                          setBookName("");
                          setActiveBookId(e.target.value);
                        }}
                      >
                        <option value="default">default</option>
                        {books
                          .filter((b) => b !== "default")
                          .map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="text-xs text-slate-500">
                      Tip: type a new name to create a new book; or pick an existing one.
                    </div>
                  </div>

                  {sessions.length ? (
                    <div className="space-y-2">
                      <div className="text-xs text-slate-400">Recent sessions</div>
                      <div className="space-y-2">
                        {sessions.slice(0, 6).map((s) => (
                          <div
                            key={s.sessionId}
                            className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/20 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-xs text-slate-200">
                                {s.sessionId}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {new Date(s.createdAt).toLocaleString()}
                                {s.continuedFromSessionId
                                  ? ` • continued from ${s.continuedFromSessionId.slice(0, 8)}…`
                                  : ""}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => handleViewSession(activeBookId, s.sessionId)}
                              >
                                View
                              </Button>
                              <Button
                                type="button"
                                onClick={() => handleContinueFrom(activeBookId, s.sessionId)}
                              >
                                Continue
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-slate-500">
                        “View” replays the saved transcript. “Continue” creates a new live session from that point.
                      </div>
                    </div>
                  ) : null}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={mode === "easy" ? "default" : "secondary"}
                      onClick={() => setMode("easy")}
                    >
                      Easy mode
                    </Button>
                    <Button
                      type="button"
                      variant={mode === "hard" ? "default" : "secondary"}
                      onClick={() => setMode("hard")}
                    >
                      Hard mode
                    </Button>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" onClick={handleStart}>
                      Start Copilot
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {pendingQuestions ? (
              <AskQuestionsCard
                questions={pendingQuestions.data.questions}
                onSubmit={handleSubmitAnswers}
              />
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
                        : "border-red-900/40 bg-red-950/20"
                  }
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="capitalize">{m.role}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="whitespace-pre-wrap text-sm leading-6">
                      {m.content}
                    </pre>
                  </CardContent>
                </Card>
              ))}
          </div>

          <Separator />
          <div className="p-4 space-y-2">
            <Textarea
              value={input}
              placeholder="Say something to Copilot..."
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setChat([])}
                disabled={isSending}
              >
                Clear chat
              </Button>
              <Button type="button" onClick={handleSend} disabled={isSending || !sessionId}>
                Send
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
              <select
                className="h-9 rounded-md border border-slate-700 bg-slate-950/40 px-2 text-sm"
                value={activeBookId}
                onChange={(e) => resetUiForBookSwitch(e.target.value)}
              >
                <option value="default">default</option>
                {books
                  .filter((b) => b !== "default")
                  .map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
              </select>
              <Button variant="secondary" onClick={() => refreshBookList()} type="button">
                Refresh files
              </Button>
              <select
                className="h-9 rounded-md border border-slate-700 bg-slate-950/40 px-2 text-sm"
                value={activeFile ?? ""}
                onChange={(e) => setActiveFile(e.target.value)}
              >
                {bookFiles.length ? (
                  bookFiles.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))
                ) : (
                  <option value="">(no chapters yet)</option>
                )}
              </select>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-0 flex-1 min-h-0">
            <div className="border-r border-slate-800 min-h-0 flex flex-col">
              <div className="p-3 text-xs text-slate-400 border-b border-slate-800">
                Rolling output (top → bottom)
              </div>
              <div className="flex-1 overflow-auto p-4">
                <pre className="whitespace-pre-wrap text-sm leading-6">
                  {rollingOutput || streamBuffer ? (
                    `${rollingOutput}${rollingOutput && streamBuffer ? "\n\n" : ""}${streamBuffer}`
                  ) : (
                    "(not started yet)"
                  )}
                </pre>
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
