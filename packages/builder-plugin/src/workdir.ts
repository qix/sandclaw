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
  repo: string;
  workDir: string;
  branchName: string;
  baseBranch?: string;
}

export async function prepareWorkDir(
  options: PrepareWorkDirOptions,
): Promise<{ headBefore: string }> {
  const { repo, workDir, branchName, baseBranch = "main" } = options;

  if (existsSync(workDir)) {
    // Warn and clean any in-progress work
    const status = await run("git", ["status", "--porcelain"], {
      cwd: workDir,
      capture: true,
    });
    if (status.trim()) {
      muted(
        `WARNING: Working directory ${workDir} has uncommitted changes — cleaning...`,
      );
      await run("git", ["checkout", "."], { cwd: workDir });
      await run("git", ["clean", "-fd"], { cwd: workDir });
    }

    muted(`Fetching origin/${baseBranch}...`);
    await run("git", ["fetch", "origin", baseBranch], { cwd: workDir });
  } else {
    muted(`Cloning ${repo} into ${workDir}...`);
    await run("git", ["clone", repo, workDir]);
  }

  // Skip delete+checkout if already on the target branch
  const currentBranch = (
    await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: workDir,
      capture: true,
    })
  ).trim();

  if (currentBranch === branchName) {
    muted(
      `Already on branch ${branchName}, resetting to origin/${baseBranch}...`,
    );
    await run("git", ["reset", "--hard", `origin/${baseBranch}`], {
      cwd: workDir,
    });
  } else {
    // Delete local branch if it already exists (e.g. from a previous retry)
    try {
      await run("git", ["branch", "-D", branchName], { cwd: workDir });
    } catch {
      // branch doesn't exist yet, that's fine
    }

    muted(`Creating branch ${branchName} from origin/${baseBranch}...`);
    await run("git", ["checkout", "-b", branchName, `origin/${baseBranch}`], {
      cwd: workDir,
    });
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

export interface DetectAndCommitChangesResult {
  changed: boolean;
  headBefore: string;
  headAfter: string;
}

export async function detectAndCommitChanges(
  workDir: string,
  commitMessage: string,
): Promise<DetectAndCommitChangesResult> {
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

// ---------------------------------------------------------------------------
// pushBranch
// ---------------------------------------------------------------------------

export async function pushBranch(
  workDir: string,
  branchName: string,
): Promise<void> {
  muted(`Pushing branch ${branchName}...`);
  await run("git", ["push", "origin", `${branchName}:${branchName}`], {
    cwd: workDir,
  });
}
