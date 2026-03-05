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
    } catch {
      // Non-fatal — verification will just show no diff
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

  // POST /approve/:id — approve and auto-merge the PR
  app.post("/approve/:id", async (c: any) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const request = await db("verification_requests").where("id", id).first();
    if (!request || request.status !== "pending") {
      return c.json({ error: "Not found or already resolved" }, 404);
    }
    if (
      request.plugin !== GITHUB_PLUGIN_ID ||
      request.action !== GITHUB_PR_CREATED_ACTION
    ) {
      return c.json({ error: "Not a GitHub PR request" }, 400);
    }

    const data = JSON.parse(request.data) as { repo: string; prNumber: number };

    try {
      await execFile("gh", [
        "pr",
        "merge",
        String(data.prNumber),
        "--repo",
        data.repo,
        "--rebase",
        "--auto",
      ]);
    } catch (err: any) {
      const message = err.stderr || err.message || "Unknown error";
      return c.json({ error: `gh pr merge failed: ${message}` }, 500);
    }

    await db("verification_requests")
      .where("id", id)
      .update({ status: "approved", updated_at: Date.now() });

    // Auto-pull the local repo if configured and the repo matches
    if (
      options?.autoPullPath &&
      options?.autoPullRepo &&
      data.repo === options.autoPullRepo
    ) {
      try {
        await execFile("git", ["pull"], { cwd: options.autoPullPath });
      } catch {
        // Non-fatal — the merge itself succeeded
      }
    }

    return c.json({ success: true });
  });
}
