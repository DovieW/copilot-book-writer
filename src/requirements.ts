import fs from "node:fs/promises";
import path from "node:path";

export type RequirementsLoadOptions = {
  requirementsDir: string;
};

const SKIP_FILES = new Set(["README.md"]);

export async function loadRequirementsMarkdown(
  options: RequirementsLoadOptions,
): Promise<string> {
  const entries = await fs.readdir(options.requirementsDir, {
    withFileTypes: true,
  });

  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .filter((name) => !SKIP_FILES.has(name))
    .sort((a, b) => a.localeCompare(b));

  const parts: string[] = [];
  for (const file of files) {
    const fullPath = path.join(options.requirementsDir, file);
    const content = await fs.readFile(fullPath, "utf8");
    parts.push(`\n\n---\n\n# requirements/${file}\n\n${content.trim()}\n`);
  }

  return parts.join("").trim();
}
