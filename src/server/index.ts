import path from "node:path";
import process from "node:process";

import cors from "cors";
import express from "express";
import dotenv from "dotenv";

import { initSse } from "./sse.js";
import { SessionManager } from "./sessionManager.js";
import { loadAgentCatalog } from "./bookkit/agentCatalog.js";
import { getBookLayout, slugifyBookName } from "../bookLayout.js";
import { ensureBooksRoot, migrateLegacySingleBook } from "../legacyMigration.js";

dotenv.config();

const PORT = Number(process.env.PORT || 8787);

const repoRoot = path.resolve(process.cwd());

const manager = new SessionManager({
  repoRoot,
  modelDefault: process.env.COPILOT_MODEL || "gpt-5-mini",
  cliPath: process.env.COPILOT_CLI_PATH,
  cliArgs: process.env.COPILOT_CLI_ARGS
    ? process.env.COPILOT_CLI_ARGS.split(" ").filter(Boolean)
    : undefined,
});

const app = express();
app.use(express.json({ limit: "2mb" }));

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
      // If you deploy elsewhere, set CORS_ORIGIN.
      ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
    ],
    credentials: false,
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/bookkit/status", async (_req, res) => {
  try {
    const catalog = await loadAgentCatalog(repoRoot);
    if (!catalog.agents.length) {
      res.json({ ok: false, error: "No BookKit agents found" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.get("/api/bookkit/agents", async (_req, res) => {
  try {
    res.json(await loadAgentCatalog(repoRoot));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

async function migrateLegacySingleBookOnce(): Promise<void> {
  await migrateLegacySingleBook(repoRoot, "default");
}

async function listBooks(): Promise<string[]> {
  const fs = await import("node:fs/promises");
  const booksDir = await ensureBooksRoot(repoRoot);
  const entries = await fs.readdir(booksDir, { withFileTypes: true });

  const names = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => /^[a-z0-9][a-z0-9-]*$/.test(n));

  // Only return books that look "real".
  // A real book is created via POST /api/books and has both requirements/ and book/.
  // This prevents accidentally listing a stub folder created by starting a session
  // without first creating the book.
  const out: string[] = [];
  for (const bookId of names) {
    const layout = getBookLayout(repoRoot, bookId);
    try {
      const [reqStat, draftStat] = await Promise.all([
        fs.stat(layout.requirementsDir),
        fs.stat(layout.draftDir),
      ]);
      if (reqStat.isDirectory() && draftStat.isDirectory()) {
        out.push(bookId);
      }
    } catch {
      // ignore invalid/incomplete book folders
    }
  }

  return out.sort();
}

function tryGetBookLayout(bookId: string):
  | { ok: true; layout: ReturnType<typeof getBookLayout> }
  | { ok: false; error: string } {
  try {
    return { ok: true, layout: getBookLayout(repoRoot, bookId) };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Invalid bookId" };
  }
}

type SessionMeta = {
  sessionId: string;
  bookId: string;
  createdAt: string;
  mode?: string;
  model?: string;
  continuedFromSessionId?: string | null;
};

async function listSessionsForBook(bookId: string): Promise<SessionMeta[]> {
  const fs = await import("node:fs/promises");
  const layout = getBookLayout(repoRoot, bookId);
  await fs.mkdir(layout.sessionsDir, { recursive: true });
  const entries = await fs.readdir(layout.sessionsDir, { withFileTypes: true });

  const metas = entries
    .filter((e) => e.isFile() && e.name.endsWith(".meta.json"))
    .map((e) => e.name)
    .sort();

  const out: SessionMeta[] = [];
  for (const name of metas) {
    try {
      const raw = await fs.readFile(path.resolve(layout.sessionsDir, name), "utf8");
      const parsed = JSON.parse(raw);
      if (parsed?.sessionId && parsed?.createdAt) {
        out.push(parsed as SessionMeta);
      }
    } catch {
      // ignore
    }
  }

  // newest first
  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}

app.get("/api/books", async (_req, res) => {
  try {
    res.json({ books: await listBooks() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/books", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const bookId = slugifyBookName(name);
    const layout = getBookLayout(repoRoot, bookId);
    const fs = await import("node:fs/promises");
    await fs.mkdir(layout.requirementsDir, { recursive: true });
    await fs.mkdir(layout.draftDir, { recursive: true });
    await fs.mkdir(layout.sessionsDir, { recursive: true });
    res.json({ bookId });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get("/api/books/:bookId", async (req, res) => {
  try {
    const bookId = String(req.params.bookId || "").trim();
    const layoutResult = tryGetBookLayout(bookId);
    if (!layoutResult.ok) {
      res.status(400).json({ error: layoutResult.error });
      return;
    }
    const layout = layoutResult.layout;
    const fs = await import("node:fs/promises");
    const stats = await fs.stat(layout.bookDir);
    if (!stats.isDirectory()) {
      res.status(404).json({ error: "book not found" });
      return;
    }
    const createdAt = stats.birthtime || stats.ctime;
    const updatedAt = stats.mtime;
    res.json({
      bookId: layout.bookId,
      name: layout.bookId,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || String(err) });
  }
});

app.get("/api/books/:bookId/sessions", async (req, res) => {
  try {
    const bookId = String(req.params.bookId || "").trim();
    const layoutResult = tryGetBookLayout(bookId);
    if (!layoutResult.ok) {
      res.status(400).json({ error: layoutResult.error });
      return;
    }
    res.json({ sessions: await listSessionsForBook(layoutResult.layout.bookId) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/books/:bookId/sessions/start", async (req, res) => {
  try {
    const bookId = String(req.params.bookId || "").trim();
    const layoutResult = tryGetBookLayout(bookId);
    if (!layoutResult.ok) {
      res.status(400).json({ error: layoutResult.error });
      return;
    }

    // Ensure the book exists (was created via POST /api/books). This avoids
    // creating "books/<id>/.sessions" for a non-existent book.
    const fs = await import("node:fs/promises");
    try {
      const [reqStat, draftStat] = await Promise.all([
        fs.stat(layoutResult.layout.requirementsDir),
        fs.stat(layoutResult.layout.draftDir),
      ]);
      if (!reqStat.isDirectory() || !draftStat.isDirectory()) {
        res.status(404).json({ error: "book not found" });
        return;
      }
    } catch {
      res.status(404).json({ error: "book not found" });
      return;
    }

    const model = typeof req.body?.model === "string" ? req.body.model : undefined;
    const created = await manager.createSession(layoutResult.layout.bookId, model);
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/books/:bookId/sessions/:id/continue", async (req, res) => {
  try {
    const bookId = String(req.params.bookId || "").trim();
    const layoutResult = tryGetBookLayout(bookId);
    if (!layoutResult.ok) {
      res.status(400).json({ error: layoutResult.error });
      return;
    }
    const fromSessionId = String(req.params.id || "").trim();
    const fs = await import("node:fs/promises");
    const metaPath = path.resolve(layoutResult.layout.sessionsDir, `${fromSessionId}.meta.json`);
    try {
      await fs.stat(metaPath);
    } catch {
      res.status(404).json({ error: "session not found" });
      return;
    }
    const created = await manager.continueSession(layoutResult.layout.bookId, fromSessionId);
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/sessions", async (req, res) => {
  try {
    const bookName = String(req.body?.bookName || req.body?.book || "").trim();
    if (!bookName) {
      res.status(400).json({ error: "bookName is required" });
      return;
    }
    const bookId = slugifyBookName(bookName);

    const model = typeof req.body?.model === "string" ? req.body.model : undefined;
    const created = await manager.createSession(bookId, model);
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get("/api/sessions/:id", (req, res) => {
  try {
    res.json(manager.getSessionInfo(req.params.id));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/sessions/:id/start", async (req, res) => {
  try {
    const sessionId = req.params.id;
    await manager.startSession(sessionId);
    res.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || String(err);
    res.status(message.includes("Unknown session") ? 404 : 500).json({ error: message });
  }
});

app.get("/api/sessions/:id/events", (req, res) => {
  try {
    const { send } = initSse(res);
    const sessionId = req.params.id;

    send("event", { type: "status", data: { message: "connected" } });
    try {
      send("event", { type: "session.info", data: manager.getSessionInfo(sessionId) });
    } catch {
      send("event", { type: "session.info", data: { exists: false } });
    }

    const unsubscribe = manager.subscribe(sessionId, (evt) => {
      send("event", evt);
    });

    req.on("close", () => {
      unsubscribe();
    });
  } catch (err: any) {
    res.status(404).end(err?.message || "Unknown session");
  }
});

// Book-aware SSE endpoint: can replay persisted events even after a page reload.
app.get("/api/books/:bookId/sessions/:id/events", async (req, res) => {
  const fs = await import("node:fs/promises");
  try {
    const { send } = initSse(res);
    const bookId = String(req.params.bookId || "").trim();
    const layoutResult = tryGetBookLayout(bookId);
    if (!layoutResult.ok) {
      res.status(400).end(layoutResult.error);
      return;
    }
    const sessionId = req.params.id;

    const layout = layoutResult.layout;
    const logPath = path.resolve(layout.sessionsDir, `${sessionId}.jsonl`);

    send("event", { type: "status", data: { message: "connected" } });

    // Let the client know whether the in-memory session is alive.
    try {
      send("event", { type: "session.info", data: manager.getSessionInfo(sessionId) });
    } catch {
      send("event", { type: "session.info", data: { exists: false } });
    }

    // Mark the following events as historical replay so the UI doesn't treat
    // replayed ask_questions as currently pending.
    send("event", { type: "replay", data: { phase: "begin" } });

    // Replay historical events first (if present).
    try {
      const raw = await fs.readFile(logPath, "utf8");
      const lines = raw.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed.type === "string" && parsed.data) {
            const { ts: _ts, ...rest } = parsed;
            send("event", rest);
          }
        } catch {
          // ignore malformed lines
        }
      }
    } catch {
      // no log yet
    }

    send("event", { type: "replay", data: { phase: "end" } });

    // If the session is still alive in memory, subscribe for live updates.
    let unsubscribe: (() => void) | undefined;
    try {
      const info = manager.getSessionInfo(sessionId);
      if (info.exists) {
        unsubscribe = manager.subscribe(sessionId, (evt) => send("event", evt));
      } else {
        send("event", { type: "status", data: { message: "session_offline" } });
      }
    } catch {
      send("event", { type: "status", data: { message: "session_offline" } });
    }

    req.on("close", () => {
      unsubscribe?.();
    });
  } catch (err: any) {
    res.status(404).end(err?.message || "Unknown session");
  }
});

app.post("/api/sessions/:id/messages", async (req, res) => {
  try {
    const sessionId = req.params.id;
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    let agentId: string | undefined;
    if (typeof req.body?.agentId === "string" && req.body.agentId.trim()) {
      agentId = req.body.agentId.trim();
      const catalog = await loadAgentCatalog(repoRoot);
      const exists = catalog.agents.some((agent) => agent.id === agentId);
      if (!exists) {
        res.status(400).json({ error: "unknown agentId" });
        return;
      }
    }

    await manager.sendMessage(sessionId, prompt, agentId);
    res.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || String(err);
    res.status(message.includes("Unknown session") ? 404 : 500).json({ error: message });
  }
});

app.post("/api/sessions/:id/answers", (req, res) => {
  try {
    const sessionId = req.params.id;
    const answers = req.body?.answers;
    if (!answers || typeof answers !== "object") {
      res.status(400).json({ error: "answers is required" });
      return;
    }

    const askIdRaw = req.body?.askId;
    const askId = typeof askIdRaw === "string" && askIdRaw.trim() ? askIdRaw.trim() : undefined;

    manager.answerQuestions(sessionId, { answers }, askId);
    res.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || String(err);
    res.status(message.includes("Unknown session") ? 404 : 500).json({ error: message });
  }
});

app.get("/api/books/:bookId/book/list", async (req, res) => {
  try {
    const fs = await import("node:fs/promises");
    const bookId = String(req.params.bookId || "").trim();
    const layoutResult = tryGetBookLayout(bookId);
    if (!layoutResult.ok) {
      res.status(400).json({ error: layoutResult.error });
      return;
    }
    const layout = layoutResult.layout;
    const bookDir = layout.draftDir;
    const entries = await fs.readdir(bookDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort();
    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get("/api/books/:bookId/book/read", async (req, res) => {
  try {
    const name = String(req.query.path || "").trim();
    if (
      !name ||
      name.includes("..") ||
      name.includes("/") ||
      name.includes("\\") ||
      path.basename(name) !== name
    ) {
      res
        .status(400)
        .json({ error: "path must be a file name under books/<bookId>/book/" });
      return;
    }
    const bookId = String(req.params.bookId || "").trim();
    const layoutResult = tryGetBookLayout(bookId);
    if (!layoutResult.ok) {
      res.status(400).json({ error: layoutResult.error });
      return;
    }
    const layout = layoutResult.layout;
    const fs = await import("node:fs/promises");
    const filePath = path.resolve(layout.draftDir, name);
    const content = await fs.readFile(filePath, "utf8");
    res.json({ content });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || String(err) });
  }
});

// Back-compat for older clients (defaults to books/default).
app.get("/api/book/list", async (_req, res) => {
  res.redirect(307, "/api/books/default/book/list");
});

app.get("/api/book/read", async (req, res) => {
  const p = encodeURIComponent(String(req.query.path || ""));
  res.redirect(307, `/api/books/default/book/read?path=${p}`);
});

async function main() {
  await ensureBooksRoot(repoRoot);
  await migrateLegacySingleBookOnce();
  await manager.start();

  const server = app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    // eslint-disable-next-line no-console
    console.log("Shutting down...");
    server.close(() => undefined);
    await manager.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
