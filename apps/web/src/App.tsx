import * as React from "react";

import type { ServerEvent } from "./api";
import {
  createSession,
  listBookFiles,
  readBookFile,
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
  const [status, setStatus] = React.useState<string>("starting...");
  const [chat, setChat] = React.useState<ChatMessage[]>([]);
  const [draftStream, setDraftStream] = React.useState<string>("");

  const [pendingQuestions, setPendingQuestions] = React.useState<
    ServerEvent & { type: "ask_questions" }
  >();

  const [input, setInput] = React.useState<string>("");
  const [isSending, setIsSending] = React.useState(false);

  const [bookFiles, setBookFiles] = React.useState<string[]>([]);
  const [activeFile, setActiveFile] = React.useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = React.useState<string>("");

  async function refreshBookList() {
    try {
      const files = await listBookFiles();
      setBookFiles(files);
      if (!activeFile && files.length) setActiveFile(files[0]);
    } catch {
      // ignore until files exist
    }
  }

  async function refreshActiveFile(name: string) {
    try {
      const content = await readBookFile(name);
      setActiveFileContent(content);
    } catch (err: any) {
      setActiveFileContent(String(err?.message || err));
    }
  }

  React.useEffect(() => {
    (async () => {
      const { sessionId } = await createSession();
      setSessionId(sessionId);
      setStatus("session created");

      const es = new EventSource(`/api/sessions/${sessionId}/events`);
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
          setDraftStream((prev) => prev + data.data.delta);
          return;
        }

        if (data.type === "assistant.message") {
          setChat((prev) => [...prev, { role: "assistant", content: data.data.content }]);
          setDraftStream("");
          return;
        }

        if (data.type === "user.message") {
          setChat((prev) => [...prev, { role: "user", content: data.data.content }]);
          return;
        }

        if (data.type === "file.updated") {
          refreshBookList();
          if (activeFile && data.data.path === `book/${activeFile}`) {
            refreshActiveFile(activeFile);
          }
          return;
        }
      });

      es.onerror = () => {
        setStatus("disconnected");
      };

      refreshBookList();

      return () => es.close();
    })().catch((err) => {
      setStatus("failed");
      setChat([{ role: "system", content: String(err?.message || err) }]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!activeFile) return;
    refreshActiveFile(activeFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile]);

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
            {pendingQuestions ? (
              <AskQuestionsCard
                questions={pendingQuestions.data.questions}
                onSubmit={handleSubmitAnswers}
              />
            ) : null}

            {chat.map((m, idx) => (
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
            <div className="text-xs text-slate-500">
              Tip: Ctrl+Enter / Cmd+Enter to send.
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
              <Button variant="secondary" onClick={refreshBookList} type="button">
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
                Live stream (while Copilot is typing)
              </div>
              <div className="flex-1 overflow-auto p-4">
                <pre className="whitespace-pre-wrap text-sm leading-6">
                  {draftStream || "(waiting...)"}
                </pre>
              </div>
            </div>
            <div className="min-h-0 flex flex-col">
              <div className="p-3 text-xs text-slate-400 border-b border-slate-800">
                {activeFile ? `book/${activeFile}` : "No chapter selected"}
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
