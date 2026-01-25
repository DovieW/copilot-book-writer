import path from "node:path";

export type BookLayout = {
  bookId: string;
  bookDir: string;
  requirementsDir: string;
  draftDir: string;
  sessionsDir: string;
};

/**
 * Turn a human-friendly name into a safe folder name.
 * Example: "My Cool Book!!" -> "my-cool-book".
 */
export function slugifyBookName(name: string): string {
  const raw = String(name || "").trim().toLowerCase();
  const slug = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-+/g, "-");

  return slug || "default";
}

/**
 * Validate a book id is safe for filesystem use (no path traversal).
 */
export function assertSafeBookId(bookId: string): void {
  const id = String(bookId || "").trim();
  if (!id) throw new Error("bookId is required");
  if (id.includes("/") || id.includes("\\") || id.includes("..")) {
    throw new Error(`Invalid bookId: ${bookId}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(
      `Invalid bookId '${bookId}'. Use letters/numbers/dashes, e.g. 'my-book'.`,
    );
  }
}

export function getBookLayout(repoRoot: string, bookId: string): BookLayout {
  assertSafeBookId(bookId);
  const bookDir = path.resolve(repoRoot, "books", bookId);
  return {
    bookId,
    bookDir,
    requirementsDir: path.resolve(bookDir, "requirements"),
    draftDir: path.resolve(bookDir, "book"),
    sessionsDir: path.resolve(bookDir, ".sessions"),
  };
}
