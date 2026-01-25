import path from "node:path";
import process from "node:process";

import cors from "cors";
import express from "express";
import dotenv from "dotenv";

import { initSse } from "./sse.js";
import { SessionManager } from "./sessionManager.js";
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

async function migrateLegacySingleBookOnce(): Promise<void> {
  await migrateLegacySingleBook(repoRoot, "default");
}

async function listBooks(): Promise<string[]> {
  const fs = await import("node:fs/promises");
  const booksDir = await ensureBooksRoot(repoRoot);
  const entries = await fs.readdir(booksDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => /^[a-z0-9][a-z0-9-]*$/.test(n))
    .sort();
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

app.post("/api/sessions", async (req, res) => {
  try {
    const modeRaw = typeof req.body?.mode === "string" ? req.body.mode : "";
    const mode = modeRaw === "easy" || modeRaw === "hard" ? modeRaw : undefined;
    if (!mode) {
      res.status(400).json({ error: "mode must be 'easy' or 'hard'" });
      return;
    }

    const bookName = String(req.body?.bookName || req.body?.book || "").trim();
    const bookId = slugifyBookName(bookName || "default");

    const model = typeof req.body?.model === "string" ? req.body.model : undefined;
    const created = await manager.createSession(mode, bookId, model);
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
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get("/api/sessions/:id/events", (req, res) => {
  try {
    const { send } = initSse(res);
    const sessionId = req.params.id;

    send("event", { type: "status", data: { message: "connected" } });

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
    const sessionId = req.params.id;

    const layout = getBookLayout(repoRoot, bookId);
    const logPath = path.resolve(layout.sessionsDir, `${sessionId}.jsonl`);

    send("event", { type: "status", data: { message: "connected" } });

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
    await manager.sendMessage(sessionId, prompt);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
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
    manager.answerQuestions(sessionId, { answers });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get("/api/books/:bookId/book/list", async (req, res) => {
  try {
    const fs = await import("node:fs/promises");
    const bookId = String(req.params.bookId || "").trim();
    const layout = getBookLayout(repoRoot, bookId);
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
    const name = String(req.query.path || "");
    if (!name || name.includes("..") || name.includes("/")) {
      res
        .status(400)
        .json({ error: "path must be a file name under books/<bookId>/book/" });
      return;
    }
    const bookId = String(req.params.bookId || "").trim();
    const layout = getBookLayout(repoRoot, bookId);
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
