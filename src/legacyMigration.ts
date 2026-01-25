import path from "node:path";
import fs from "node:fs/promises";
import { getBookLayout } from "./bookLayout.js";

export async function ensureBooksRoot(repoRoot: string): Promise<string> {
  const booksDir = path.resolve(repoRoot, "books");
  await fs.mkdir(booksDir, { recursive: true });
  return booksDir;
}

export async function migrateLegacySingleBook(
  repoRoot: string,
  defaultBookId: string = "default",
): Promise<void> {
  const legacyRequirements = path.resolve(repoRoot, "requirements");
  const legacyBook = path.resolve(repoRoot, "book");

  const defaultLayout = getBookLayout(repoRoot, defaultBookId);

  const exists = async (p: string) => {
    try {
      await fs.stat(p);
      return true;
    } catch {
      return false;
    }
  };

  const legacyReqExists = await exists(legacyRequirements);
  const legacyBookExists = await exists(legacyBook);
  const defaultExists = await exists(defaultLayout.bookDir);

  if (!legacyReqExists && !legacyBookExists) return;
  if (defaultExists) return;

  await fs.mkdir(defaultLayout.bookDir, { recursive: true });
  await fs.mkdir(defaultLayout.requirementsDir, { recursive: true });
  await fs.mkdir(defaultLayout.draftDir, { recursive: true });
  await fs.mkdir(defaultLayout.sessionsDir, { recursive: true });

  if (legacyReqExists) {
    await fs.rename(legacyRequirements, defaultLayout.requirementsDir);
  }
  if (legacyBookExists) {
    await fs.rename(legacyBook, defaultLayout.draftDir);
  }
}
