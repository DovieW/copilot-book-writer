import path from "node:path";
import fs from "node:fs/promises";

import type { AgentCatalog, AgentMode } from "./types.js";

const BOOKKIT_AGENTS_DIR = "agents/bookkit";
const PROMPT_EXTENSIONS = new Set([".md"]);
const CACHE_TTL_MS = 5_000;

// Only treat these subfolders as actual agent prompt sources.
// This prevents docs like agents/bookkit/README.md from showing up as a selectable agent.
const ALLOWED_AGENT_FOLDERS = new Set(["initialize", "write"]);

let cachedCatalog: AgentCatalog | null = null;
let cachedAt = 0;

function stripNumericPrefix(value: string): string {
  return value.replace(/^\d+[_-]?/, "");
}

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function extractFrontmatterDescription(content: string): string | undefined {
  const match = content.match(/^---\s*([\s\S]*?)\s*---/);
  if (!match) return undefined;
  const body = match[1];
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.toLowerCase().startsWith("description:"));
  if (!line) return undefined;
  const raw = line.split(":").slice(1).join(":").trim();
  return raw.replace(/^"|"$/g, "").replace(/^'|'$/g, "").trim() || undefined;
}

function extractH1(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || undefined;
}

async function listPromptFiles(dirAbs: string): Promise<string[]> {
  const entries = await fs.readdir(dirAbs, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const abs = path.resolve(dirAbs, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      files.push(...(await listPromptFiles(abs)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!PROMPT_EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push(abs);
  }
  return files;
}

function buildAgentId(relPath: string): string {
  const parts = relPath.split("/").filter(Boolean);
  const fileName = parts.pop() || relPath;
  const base = stripNumericPrefix(fileName.replace(/\.[^.]+$/, ""));
  const dir = parts.join("/");
  return dir ? `${dir}/${base}` : base;
}

function parseStepNumberFromPath(relToAgents: string): number | undefined {
  const fileName = relToAgents.split("/").pop() || "";
  const match = fileName.match(/^(\d+)/);
  if (!match) return undefined;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : undefined;
}

function groupLabelFromPath(relToAgents: string): string {
  const top = relToAgents.split("/").filter(Boolean)[0] || "";
  if (top === "initialize") return "Init";
  if (top === "write") return "Write";
  return top ? toTitleCase(top) : "Agent";
}

export async function loadAgentCatalog(repoRoot: string): Promise<AgentCatalog> {
  const now = Date.now();
  if (cachedCatalog && now - cachedAt < CACHE_TTL_MS) {
    return cachedCatalog;
  }

  const rootAbs = path.resolve(repoRoot, BOOKKIT_AGENTS_DIR);
  let promptFiles: string[] = [];

  try {
    promptFiles = await listPromptFiles(rootAbs);
  } catch {
    cachedCatalog = { agents: [] };
    cachedAt = now;
    return cachedCatalog;
  }

  const agents: AgentMode[] = [];
  for (const fileAbs of promptFiles) {
    const relToRoot = path.relative(repoRoot, fileAbs).split(path.sep).join("/");
    const relToAgents = path.relative(rootAbs, fileAbs).split(path.sep).join("/");

    if (relToAgents.startsWith("..") || relToAgents.includes("..")) continue;

    const relParts = relToAgents.split("/").filter(Boolean);
    const topLevelDir = relParts[0] || "";
    if (!ALLOWED_AGENT_FOLDERS.has(topLevelDir)) continue;

    const step = parseStepNumberFromPath(relToAgents);
    const groupLabel = groupLabelFromPath(relToAgents);

    const content = await fs.readFile(fileAbs, "utf8");
    const description = extractFrontmatterDescription(content);

    const fileBase = stripNumericPrefix(path.basename(relToAgents, path.extname(relToAgents)));
    const title = extractH1(content) || toTitleCase(fileBase);

    // If we have a step number, make it super clear what order to use.
    // Numbering resets per group (Init vs Write).
    const displayName = step ? `${groupLabel} ${step}: ${title}` : `${groupLabel}: ${title}`;

    agents.push({
      id: buildAgentId(relToAgents),
      displayName,
      description: description || undefined,
      promptPath: relToRoot,
    });
  }

  // Sort by group, then step, then id.
  const groupOrder: Record<string, number> = { initialize: 0, write: 1 };
  agents.sort((a, b) => {
    const aGroup = a.id.split("/")[0] || "";
    const bGroup = b.id.split("/")[0] || "";
    const aGroupRank = groupOrder[aGroup] ?? 999;
    const bGroupRank = groupOrder[bGroup] ?? 999;
    if (aGroupRank !== bGroupRank) return aGroupRank - bGroupRank;

    const aStepMatch = a.displayName.match(/\b(\d+):/);
    const bStepMatch = b.displayName.match(/\b(\d+):/);
    const aStep = aStepMatch ? Number.parseInt(aStepMatch[1], 10) : Number.NaN;
    const bStep = bStepMatch ? Number.parseInt(bStepMatch[1], 10) : Number.NaN;

    if (Number.isFinite(aStep) && Number.isFinite(bStep) && aStep !== bStep) {
      return aStep - bStep;
    }

    return a.id.localeCompare(b.id);
  });

  cachedCatalog = { agents };
  cachedAt = now;
  return cachedCatalog;
}

export async function loadAgentPromptById(
  repoRoot: string,
  agentId: string,
): Promise<{ prompt: string; promptPath: string } | undefined> {
  const catalog = await loadAgentCatalog(repoRoot);
  const agent = catalog.agents.find((a) => a.id === agentId);
  if (!agent) return undefined;

  const abs = path.resolve(repoRoot, agent.promptPath);
  const rootAbs = path.resolve(repoRoot, BOOKKIT_AGENTS_DIR);
  const normalizedRoot = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;

  if (!abs.startsWith(normalizedRoot)) return undefined;

  const prompt = await fs.readFile(abs, "utf8");
  return { prompt, promptPath: agent.promptPath };
}
