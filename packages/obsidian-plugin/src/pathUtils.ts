import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export function resolveVaultRoot(vaultRoot: string): string {
  const expanded = vaultRoot.startsWith("~")
    ? path.join(homedir(), vaultRoot.slice(1))
    : vaultRoot;
  return path.resolve(expanded);
}

export function resolveVaultPath(
  vaultRoot: string,
  relativePath: string,
): string | null {
  const normalized = relativePath.trim().replace(/\\/g, "/");
  if (!normalized || path.isAbsolute(normalized)) return null;
  const absolute = path.resolve(vaultRoot, normalized);
  const relative = path.relative(vaultRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    return null;
  return absolute;
}

export async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
