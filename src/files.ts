import fs from "node:fs/promises";
import path from "node:path";

export async function readFileIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return "";
    throw err;
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function appendMarkdown(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const prefix = content.startsWith("\n") ? "" : "\n\n";
  await fs.appendFile(filePath, `${prefix}${content.trim()}\n`, "utf8");
}
