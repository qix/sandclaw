import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Resolve a relative path against a root directory, returning null if the path
 * escapes the root (e.g. via `../`). Only accepts relative paths.
 */
export function resolveSecurePath(
  rootDir: string,
  relativePath: string,
): string | null {
  const normalized = relativePath.trim().replace(/\\/g, "/");
  if (!normalized || path.isAbsolute(normalized)) return null;
  const absolute = path.resolve(rootDir, normalized);
  const relative = path.relative(rootDir, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    return null;
  return absolute;
}

/**
 * Read a file, returning null instead of throwing on ENOENT.
 */
export async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
