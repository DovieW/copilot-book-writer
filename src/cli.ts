import path from "node:path";
import process from "node:process";

import { loadRequirementsMarkdown } from "./requirements.js";
import { readFileIfExists, appendMarkdown } from "./files.js";
import { generateChunk } from "./bookWriter.js";

type Args = {
  command?: string;
  section: string;
  words: number;
  model: string;
  requirementsDir: string;
  draftPath: string;
};

function parseArgs(argv: string[]): Args {
  const command = argv[2];
  const args: Args = {
    command,
    section: "",
    words: 800,
    model: process.env.COPILOT_MODEL || "gpt-5",
    requirementsDir: "requirements",
    draftPath: "book/draft.md",
  };

  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--section") args.section = argv[++i] || "";
    else if (a === "--words") args.words = Number(argv[++i] || "800");
    else if (a === "--model") args.model = argv[++i] || args.model;
    else if (a === "--requirements") args.requirementsDir = argv[++i] || args.requirementsDir;
    else if (a === "--draft") args.draftPath = argv[++i] || args.draftPath;
    else if (a === "--help" || a === "-h") {
      args.command = "help";
    }
  }

  return args;
}

function printHelp(): void {
  // Keep this short; people will use `npm run write -- --help`.
  console.log(`
Copilot Book Writer

Commands:
  write --section "Chapter 1" [--words 800] [--model gpt-5]

Options:
  --section       Which section you want to write next (required)
  --words         Approx target word count (default: 800)
  --model         Copilot model (default: gpt-5)
  --requirements  Requirements directory (default: requirements)
  --draft         Draft file path (default: book/draft.md)
`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.command || args.command === "help") {
    printHelp();
    process.exit(0);
  }

  if (args.command !== "write") {
    console.error(`Unknown command: ${args.command}`);
    printHelp();
    process.exit(1);
  }

  if (!args.section.trim()) {
    console.error("Missing required flag: --section");
    printHelp();
    process.exit(1);
  }

  const requirementsDir = path.resolve(process.cwd(), args.requirementsDir);
  const draftPath = path.resolve(process.cwd(), args.draftPath);

  const requirementsMarkdown = await loadRequirementsMarkdown({
    requirementsDir,
  });

  const currentDraft = await readFileIfExists(draftPath);

  const chunk = await generateChunk({
    model: args.model,
    requirementsMarkdown,
    currentDraft,
    section: args.section,
    words: args.words,
  });

  await appendMarkdown(draftPath, `\n\n## ${args.section}\n\n${chunk}\n`);

  console.log(`\nWrote a new chunk to ${path.relative(process.cwd(), draftPath)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
