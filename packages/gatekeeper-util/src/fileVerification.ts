import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveSecurePath, tryReadFile } from "./pathUtils";

export interface FileVerificationConfig {
  /** Absolute path to the root directory. */
  rootDir: string;
  /** Called after a file is written (e.g. to invalidate a search index). */
  afterWrite?: () => void;
}

/**
 * Create a verification callback that handles `edit_file` and `write_file`
 * actions. On `edit_file`, the find/replace is reapplied against the current
 * file content so the edit survives concurrent changes.
 */
export function createFileVerificationCallback(config: FileVerificationConfig) {
  return async (request: { id: number; action: string; data: any }) => {
    const absPath = resolveSecurePath(config.rootDir, request.data.path);
    if (!absPath) throw new Error("Invalid path in verification data");

    const currentContent = (await tryReadFile(absPath)) ?? "";

    if (request.action === "edit_file") {
      const { oldString, newString, replaceAll } = request.data;
      const firstIndex = currentContent.indexOf(oldString);
      if (firstIndex < 0) {
        throw new Error(
          "old_string no longer found in file. The file may have changed. Please re-request the edit.",
        );
      }
      if (!replaceAll) {
        const secondIndex = currentContent.indexOf(
          oldString,
          firstIndex + 1,
        );
        if (secondIndex >= 0) {
          throw new Error(
            "old_string is no longer unique in file. The file may have changed. Please re-request the edit.",
          );
        }
      }

      let nextContent: string;
      if (replaceAll) {
        nextContent = currentContent.split(oldString).join(newString);
      } else {
        nextContent =
          currentContent.slice(0, firstIndex) +
          newString +
          currentContent.slice(firstIndex + oldString.length);
      }

      await mkdir(path.dirname(absPath), { recursive: true });
      await writeFile(absPath, nextContent, "utf8");
    } else {
      // write_file — exact content replacement, must not have changed
      if (currentContent !== request.data.previousContent) {
        throw new Error(
          "File changed since verification was created. Please re-request the write.",
        );
      }

      await mkdir(path.dirname(absPath), { recursive: true });
      await writeFile(absPath, request.data.nextContent, "utf8");
    }

    config.afterWrite?.();
  };
}
