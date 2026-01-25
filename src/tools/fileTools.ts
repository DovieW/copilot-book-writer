import fs from "node:fs/promises";
import path from "node:path";
import { defineTool } from "@github/copilot-sdk";
import { z } from "zod";

export type FileToolPaths = {
  repoRoot: string;
  allowedRoots?: {
    requirementsDirAbs: string;
    bookDirAbs: string;
  };
};

function resolveSafePath(paths: FileToolPaths, requestedPath: string): string {
  const normalized = requestedPath.replace(/\\/g, "/");

  // Disallow absolute paths and parent traversal.
  if (normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`Unsafe path: ${requestedPath}`);
  }

  const abs = path.resolve(paths.repoRoot, normalized);

  const requirementsRoot =
    (paths.allowedRoots?.requirementsDirAbs
      ? path.resolve(paths.allowedRoots.requirementsDirAbs)
      : path.resolve(paths.repoRoot, "requirements")) + path.sep;
  const bookRoot =
    (paths.allowedRoots?.bookDirAbs
      ? path.resolve(paths.allowedRoots.bookDirAbs)
      : path.resolve(paths.repoRoot, "book")) + path.sep;

  // Compare with trailing separator so `requirementsX` doesn't match.
  const absWithSep = abs.endsWith(path.sep) ? abs : abs + path.sep;
  if (!absWithSep.startsWith(requirementsRoot) && !absWithSep.startsWith(bookRoot)) {
    throw new Error(`Path must be under requirements/ or book/: ${requestedPath}`);
  }

  return abs;
}

export function createFileTools(paths: FileToolPaths) {
  const readTextFile = defineTool("read_text_file", {
    description:
      "Read a UTF-8 text file under requirements/ or book/ and return its contents.",
    parameters: z.object({
      path: z.string().describe("Repo-relative path, e.g. requirements/project.md"),
    }),
    handler: async ({ path: p }) => {
      const abs = resolveSafePath(paths, p);
      const content = await fs.readFile(abs, "utf8");
      return { content };
    },
  });

  const writeTextFile = defineTool("write_text_file", {
    description:
      "Write a UTF-8 text file under requirements/ or book/, creating directories as needed. Overwrites the file.",
    parameters: z.object({
      path: z.string().describe("Repo-relative path"),
      content: z.string().describe("Full file contents"),
    }),
    handler: async ({ path: p, content }) => {
      const abs = resolveSafePath(paths, p);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf8");
      return { ok: true };
    },
  });

  const appendTextFile = defineTool("append_text_file", {
    description:
      "Append UTF-8 text to a file under requirements/ or book/, creating directories as needed.",
    parameters: z.object({
      path: z.string().describe("Repo-relative path"),
      content: z.string().describe("Content to append"),
    }),
    handler: async ({ path: p, content }) => {
      const abs = resolveSafePath(paths, p);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.appendFile(abs, content, "utf8");
      return { ok: true };
    },
  });

  const listFiles = defineTool("list_files", {
    description:
      "List files directly within a directory under requirements/ or book/.",
    parameters: z.object({
      dir: z.string().describe("Repo-relative directory path"),
    }),
    handler: async ({ dir }) => {
      const abs = resolveSafePath(paths, dir);
      const entries = await fs.readdir(abs, { withFileTypes: true });
      return {
        entries: entries.map((e) => ({
          name: e.name,
          kind: e.isDirectory() ? "dir" : "file",
        })),
      };
    },
  });

  return [readTextFile, writeTextFile, appendTextFile, listFiles];
}
