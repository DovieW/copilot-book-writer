import path from "node:path";
import process from "node:process";

import cors from "cors";
import express from "express";
import dotenv from "dotenv";

import { initSse } from "./sse.js";
import { SessionManager } from "./sessionManager.js";

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
      // If you deploy elsewhere, set CORS_ORIGIN.
      ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
    ],
    credentials: false,
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/sessions", async (req, res) => {
  try {
    const model = typeof req.body?.model === "string" ? req.body.model : undefined;
    const { sessionId } = await manager.createSession(model);
    res.json({ sessionId });
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

app.get("/api/book/list", async (_req, res) => {
  try {
    const fs = await import("node:fs/promises");
    const bookDir = path.resolve(repoRoot, "book");
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

app.get("/api/book/read", async (req, res) => {
  try {
    const name = String(req.query.path || "");
    if (!name || name.includes("..") || name.includes("/")) {
      res.status(400).json({ error: "path must be a file name under book/" });
      return;
    }
    const fs = await import("node:fs/promises");
    const filePath = path.resolve(repoRoot, "book", name);
    const content = await fs.readFile(filePath, "utf8");
    res.json({ content });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || String(err) });
  }
});

async function main() {
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
