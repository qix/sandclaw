import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { quote } from "shell-quote";
import { localTimestamp } from "@sandclaw/util";
import { GITHUB_PLUGIN_ID, GITHUB_PR_CREATED_ACTION } from "./constants";

const execFile = promisify(execFileCb);

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function logCmd(cmd: string, args: string[]) {
  process.stderr.write(`${BOLD}$ ${quote([cmd, ...args])}${RESET}\n`);
}

export interface GithubRouteOptions {
  /** If set, `git pull` will be run in this directory after a PR is merged on the matching repo. */
  autoPullPath?: string;
  /** The GitHub repo (owner/name) that must match for auto-pull to trigger. */
  autoPullRepo?: string;
}

export function registerRoutes(
  app: any,
  db: any,
  options?: GithubRouteOptions,
) {
  // POST /create-pr — create a PR on GitHub and add to verification queue
  app.post("/create-pr", async (c: any) => {
    const body = (await c.req.json()) as {
      repo?: string;
      head?: string;
      title?: string;
      body?: string;
      jobContext?: { worker: string; jobId: number };
    };

    const { repo, head, title, body: prBody } = body;

    if (!repo || !head) {
      return c.json({ error: "repo and head are required" }, 400);
    }

    const prTitle = title || head;

    const args = [
      "pr",
      "create",
      "--repo",
      repo,
      "--head",
      head,
      "--title",
      prTitle,
      "--body",
      prBody || "",
    ];

    let prUrl: string;
    let prNumber: number;

    try {
      logCmd("gh", args);
      const { stdout } = await execFile("gh", args);
      // gh pr create outputs the PR URL on stdout
      prUrl = stdout.trim();
      const match = prUrl.match(/\/pull\/(\d+)$/);
      if (!match) {
        return c.json({ error: `Unexpected gh output: ${prUrl}` }, 500);
      }
      prNumber = parseInt(match[1], 10);
    } catch (err: any) {
      const message = err.stderr || err.message || "Unknown error";
      return c.json({ error: `gh pr create failed: ${message}` }, 500);
    }

    // Fetch the full PR diff
    let diff = "";
    try {
      const diffArgs = ["pr", "diff", String(prNumber), "--repo", repo];
      logCmd("gh", diffArgs);
      const { stdout } = await execFile("gh", diffArgs);
      diff = stdout;
    } catch (err) {
      console.error("[github] Failed to fetch PR diff:", err);
    }

    const now = localTimestamp();
    const data = {
      repo,
      prUrl,
      prNumber,
      branch: head,
      title: prTitle,
      body: prBody || "",
      diff,
      createdAt: now,
    };

    const [{ id }] = await db("verification_requests")
      .insert({
        plugin: GITHUB_PLUGIN_ID,
        action: GITHUB_PR_CREATED_ACTION,
        data: JSON.stringify(data),
        status: "pending",
        ...(body.jobContext
          ? { job_context: JSON.stringify(body.jobContext) }
          : {}),
        created_at: now,
        updated_at: now,
      })
      .returning("id");

    return c.json({
      verificationRequestId: id,
      prUrl,
      prNumber,
      status: "pending",
    });
  });
}
