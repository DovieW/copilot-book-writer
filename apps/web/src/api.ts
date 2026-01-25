export type ServerEvent =
  | { type: "status"; data: { message: string } }
  | { type: "assistant.delta"; data: { delta: string } }
  | { type: "assistant.message"; data: { content: string } }
  | { type: "user.message"; data: { content: string } }
  | {
      type: "ask_questions";
      data: {
        questions: Array<{
          header: string;
          question: string;
          multiSelect?: boolean;
          options?: Array<{
            label: string;
            description?: string;
          }>;
        }>;
      };
    }
  | { type: "file.updated"; data: { path: string } }
  | { type: "error"; data: { message: string } };

export type SessionMode = "easy" | "hard";

export async function createSession(mode: SessionMode): Promise<{ sessionId: string }> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function startSession(sessionId: string): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function sendMessage(sessionId: string, prompt: string): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function sendAnswers(
  sessionId: string,
  answers: Record<string, string | string[]>,
): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function listBookFiles(): Promise<string[]> {
  const res = await fetch("/api/book/list");
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.files as string[];
}

export async function readBookFile(name: string): Promise<string> {
  const res = await fetch(`/api/book/read?path=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.content as string;
}
