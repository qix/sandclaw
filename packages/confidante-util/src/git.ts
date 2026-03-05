import { execSync } from "node:child_process";
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

function runExec(command: string, opts: { cwd: string }): string {
  logCmd(command.split(" ")[0], command.split(" ").slice(1));
  return execSync(command, { ...opts, encoding: "utf-8" });
}

function runSpawn(cmd: string, args: string[]): Promise<number> {
  logCmd(cmd, args);
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`${DIM}${chunk.toString()}${RESET}`);
    });
    child.on("close", (code) => resolve(code ?? 1));
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
    const status = runExec("git status --porcelain", { cwd: workDir });
    if (status.trim()) {
      throw new Error(`Working directory ${workDir} has uncommitted changes`);
    }
    muted(`Working directory ${workDir} exists and is clean, pulling latest...`);
    const pullCode = await runSpawn("git", [
      "-C",
      workDir,
      "pull",
      "origin",
      branch,
    ]);
    if (pullCode !== 0) {
      throw new Error(`git pull origin ${branch} failed with code ${pullCode}`);
    }
  } else {
    muted(`Cloning ${repo} (branch: ${branch}) into ${workDir}...`);
    const cloneCode = await runSpawn("git", [
      "clone",
      "--branch",
      branch,
      repo,
      workDir,
    ]);
    if (cloneCode !== 0) {
      throw new Error(`git clone failed with code ${cloneCode}`);
    }
  }

  const headBefore = runExec("git rev-parse HEAD", { cwd: workDir }).trim();
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
export function detectAndCommitChanges(
  options: DetectAndCommitChangesOptions,
): DetectAndCommitChangesResult {
  const { workDir, commitMessage } = options;

  const headBefore = runExec("git rev-parse HEAD", { cwd: workDir }).trim();

  const status = runExec("git status --porcelain", { cwd: workDir });

  if (status.trim()) {
    muted("Changes detected, committing...");
    runExec("git add -A", { cwd: workDir });
    runExec(`git commit -m ${JSON.stringify(commitMessage)}`, {
      cwd: workDir,
    });
    muted(`Committed changes with message: ${commitMessage}`);
  } else {
    muted("No changes detected.");
  }

  const headAfter = runExec("git rev-parse HEAD", { cwd: workDir }).trim();
  muted(`HEAD after: ${headAfter}`);

  return {
    changed: headBefore !== headAfter,
    headBefore,
    headAfter,
  };
}
