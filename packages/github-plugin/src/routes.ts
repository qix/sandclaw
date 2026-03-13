import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { GITHUB_PLUGIN_ID, GITHUB_PR_CREATED_ACTION } from "./constants";

const execFile = promisify(execFileCb);

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
    ];
    if (prBody) {
      args.push("--body", prBody);
    }

    let prUrl: string;
    let prNumber: number;

    try {
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
      const { stdout } = await execFile("gh", [
        "pr",
        "diff",
        String(prNumber),
        "--repo",
        repo,
      ]);
      diff = stdout;
    } catch (err) {
      console.error("[github] Failed to fetch PR diff:", err);
    }

    const now = Date.now();
    const data = {
      repo,
      prUrl,
      prNumber,
      branch: head,
      title: prTitle,
      body: prBody || "",
      diff,
      createdAt: new Date(now).toISOString(),
    };

    const [id] = await db("verification_requests").insert({
      plugin: GITHUB_PLUGIN_ID,
      action: GITHUB_PR_CREATED_ACTION,
      data: JSON.stringify(data),
      status: "pending",
      ...(body.jobContext
        ? { job_context: JSON.stringify(body.jobContext) }
        : {}),
      created_at: now,
      updated_at: now,
    });

    return c.json({
      verificationRequestId: id,
      prUrl,
      prNumber,
      status: "pending",
    });
  });
}
