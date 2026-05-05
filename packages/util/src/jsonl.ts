import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ensuredDirs = new Set<string>();

/**
 * Append a JSON value to `file` as a single newline-delimited record. Creates
 * the parent directory on first call per process. Linux's O_APPEND guarantees
 * atomic appends below `PIPE_BUF` (4096 bytes), which is sufficient for typical
 * chat messages — larger payloads risk interleaving under concurrent writers.
 */
export async function appendJsonLine(
  file: string,
  value: unknown,
): Promise<void> {
  const dir = path.dirname(file);
  if (!ensuredDirs.has(dir)) {
    await mkdir(dir, { recursive: true });
    ensuredDirs.add(dir);
  }
  await appendFile(file, JSON.stringify(value) + "\n", "utf8");
}
