import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { quote } from "shell-quote";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function muted(text: string) {
  process.stderr.write(`${DIM}${text}${RESET}\n`);
}

function logCmd(cmd: string, args: string[]) {
  process.stderr.write(`${BOLD}$ ${quote([cmd, ...args])}${RESET}\n`);
}

function run(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; capture?: boolean },
): Promise<string> {
  logCmd(cmd, args);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      if (opts?.capture) chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`${DIM}${chunk.toString()}${RESET}`);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${quote([cmd, ...args])} failed with code ${code}`));
      } else {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// prepareWorkDir
// ---------------------------------------------------------------------------

export interface PrepareWorkDirOptions {
  /** Git repo URL to clone from. */
  repo: string;
  /** Absolute path for the working directory. */
  workDir: string;
  /** Branch to clone / verify. @default "main" */
  branch?: string;
}

/**
 * Ensure `workDir` is a clean checkout of `repo`.
 * - If the directory exists, verifies it has no uncommitted changes.
 * - If it doesn't exist, clones `repo` at `branch` into `workDir`.
 *
 * Returns the current HEAD sha after preparation.
 */
export async function prepareWorkDir(
  options: PrepareWorkDirOptions,
): Promise<{ headBefore: string }> {
  const { repo, workDir, branch = "main" } = options;

  if (existsSync(workDir)) {
    const status = await run("git", ["status", "--porcelain"], {
      cwd: workDir,
      capture: true,
    });
    if (status.trim()) {
      throw new Error(`Working directory ${workDir} has uncommitted changes`);
    }
    muted(
      `Working directory ${workDir} exists and is clean, pulling latest...`,
    );
    await run("git", ["-C", workDir, "pull", "origin", branch]);
  } else {
    muted(`Cloning ${repo} (branch: ${branch}) into ${workDir}...`);
    await run("git", ["clone", "--branch", branch, repo, workDir]);
  }

  const headBefore = (
    await run("git", ["rev-parse", "HEAD"], { cwd: workDir, capture: true })
  ).trim();
  muted(`HEAD before: ${headBefore}`);

  return { headBefore };
}

// ---------------------------------------------------------------------------
// detectAndCommitChanges
// ---------------------------------------------------------------------------

export interface DetectAndCommitChangesOptions {
  /** Absolute path to the git working directory. */
  workDir: string;
  /** Commit message. */
  commitMessage: string;
}

export interface DetectAndCommitChangesResult {
  /** Whether any changes were detected and committed. */
  changed: boolean;
  /** HEAD sha before the commit attempt. */
  headBefore: string;
  /** HEAD sha after (same as headBefore if nothing changed). */
  headAfter: string;
}

/**
 * Check for uncommitted changes, stage everything, commit, and return
 * before/after HEAD shas.
 */
export async function detectAndCommitChanges(
  options: DetectAndCommitChangesOptions,
): Promise<DetectAndCommitChangesResult> {
  const { workDir, commitMessage } = options;

  const headBefore = (
    await run("git", ["rev-parse", "HEAD"], { cwd: workDir, capture: true })
  ).trim();

  const status = await run("git", ["status", "--porcelain"], {
    cwd: workDir,
    capture: true,
  });

  if (status.trim()) {
    muted("Changes detected, committing...");
    await run("git", ["add", "-A"], { cwd: workDir });
    await run("git", ["commit", "-m", commitMessage], { cwd: workDir });
    muted(`Committed changes with message: ${commitMessage}`);
  } else {
    muted("No changes detected.");
  }

  const headAfter = (
    await run("git", ["rev-parse", "HEAD"], { cwd: workDir, capture: true })
  ).trim();
  muted(`HEAD after: ${headAfter}`);

  return {
    changed: headBefore !== headAfter,
    headBefore,
    headAfter,
  };
}
