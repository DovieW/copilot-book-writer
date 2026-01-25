import type { Response } from "express";

export type SseSend = (event: string, data: unknown) => void;

export function initSse(res: Response): { send: SseSend } {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // If behind a proxy (nginx), prevent response buffering.
  res.setHeader("X-Accel-Buffering", "no");

  // Some runtimes expose flushHeaders; if present, call it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).flushHeaders?.();

  const send: SseSend = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  return { send };
}
