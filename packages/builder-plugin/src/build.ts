import { readFile } from "node:fs/promises";
import type { ConfidantePluginContext } from "@sandclaw/confidante-plugin-api";
import { runDockerCommand } from "@sandclaw/confidante-util";
import { localTimestamp } from "@sandclaw/util";
import { runDockerClaude } from "./docker";
import { DEFAULT_BUILDER_RESULT_JOB_TYPE } from "./constants";
import {
  prepareWorkDir,
  detectAndCommitChanges,
  pushBranch,
  run,
} from "./workdir";

interface BuildRequestPayload {
  requestId: string;
  prompt: string;
  branch?: string;
  image?: string;
  responseJobType?: string;
}

export interface BuildConfig {
  workDir: string;
  repo: string;
  dockerArgsOverride?: string[];
  systemPromptFile?: string;
}

/**
 * Extract GitHub `owner/repo` from a git URL.
 * Handles both SSH (`git@github.com:owner/repo.git`) and
 * HTTPS (`https://github.com/owner/repo.git`) formats.
 */
function extractGitHubRepo(gitUrl: string): string | null {
  // SSH: git@github.com:owner/repo.git
  const sshMatch = gitUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  return null;
}

export async function executeBuild(
  ctx: ConfidantePluginContext,
  config: BuildConfig,
): Promise<void> {
  const { workDir, repo } = config;

  /** Helper to report a build step to agent status. */
  function reportStep(stepName: string, data?: Record<string, unknown>) {
    ctx.reportStatus?.({
      jobId: ctx.job.id,
      event: "step",
      data: { step: stepName, ...data },
      createdAt: localTimestamp(),
    });
  }

  let payload: BuildRequestPayload;
  try {
    payload = JSON.parse(ctx.job.data);
  } catch {
    throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
  }

  let dockerMountArgs: string[] = ["-v", `${workDir}:/workspace`];
  if (config.dockerArgsOverride) {
    dockerMountArgs = [...config.dockerArgsOverride];
  }

  const {
    requestId,
    prompt,
    branch = "main",
    image = "builder-plugin",
    responseJobType = DEFAULT_BUILDER_RESULT_JOB_TYPE,
  } = payload;

  ctx.logger.info("builder.build.executing", {
    jobId: ctx.job.id,
    requestId,
    prompt,
    repo,
    workDir,
  });

  // Step 1: Prepare working directory — fetch origin/main, create builder branch
  reportStep("prepare_workdir", { repo, branch });
  const outputBranch = `builder-${ctx.job.id}`;
  await prepareWorkDir({
    repo,
    workDir,
    branchName: outputBranch,
    baseBranch: branch,
  });

  // Step 2: npm outside of docker
  reportStep("npm_install");
  ctx.logger.info("builder.build.npm_install", {
    jobId: ctx.job.id,
    requestId,
  });
  await run("npm", ["install"], { cwd: workDir });

  // Step 3: Run claude in Docker with proxy (cm-style prompt interception)
  reportStep("running_claude", { prompt: prompt.slice(0, 200) });
  ctx.logger.info("builder.build.running_claude", {
    jobId: ctx.job.id,
    requestId,
  });

  const claudeArgs = [
    "exec",
    "claude",
    "--dangerously-skip-permissions",
    "--print",
  ];

  if (config.systemPromptFile) {
    const systemPrompt = await readFile(config.systemPromptFile, "utf-8");
    claudeArgs.push("--system-prompt", systemPrompt);
  }

  claudeArgs.push(prompt);

  const claudeOutput = await run("devcontainer", claudeArgs, {
    cwd: workDir,
    capture: true,
  });

  reportStep("claude_completed");
  ctx.logger.info("builder.build.claude_completed", {
    jobId: ctx.job.id,
    requestId,
  });

  // Step 4: Detect and commit changes
  // Use proxy-collected prompts as the commit message for better traceability
  // (these are the actual user prompts extracted from API calls, not the raw input)
  reportStep("detect_and_commit");
  const commitMessage =
    prompt + "\n\nCreated by claude with output:\n" + claudeOutput;
  const commitResult = await detectAndCommitChanges(workDir, commitMessage);

  ctx.logger.info("builder.build.commit_result", {
    jobId: ctx.job.id,
    requestId,
    changed: commitResult.changed,
    headBefore: commitResult.headBefore,
    headAfter: commitResult.headAfter,
  });

  // Step 5: If changes were committed, push branch and create a PR
  let prUrl: string | undefined;

  if (commitResult.changed) {
    reportStep("push_branch", { branch: outputBranch });
    await pushBranch(workDir, outputBranch);

    ctx.logger.info("builder.build.pushed", {
      jobId: ctx.job.id,
      branch: outputBranch,
    });

    const ghRepo = extractGitHubRepo(repo);
    if (ghRepo) {
      reportStep("create_pr", { repo: ghRepo, branch: outputBranch });
      const prResponse = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/github/create-pr`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repo: ghRepo,
            head: outputBranch,
            title: prompt.slice(0, 70),
            body: [
              `Build from job ${ctx.job.id} (request ${requestId}).`,
              "",
              claudeOutput || "",
            ].join("\n"),
            jobContext: { worker: "muteworker", jobId: ctx.job.id },
          }),
        },
      );

      if (prResponse.ok) {
        const prData = (await prResponse.json()) as { prUrl?: string };
        prUrl = prData.prUrl;
        ctx.logger.info("builder.build.pr_created", {
          jobId: ctx.job.id,
          prUrl,
        });
      } else {
        const body = await prResponse.text().catch(() => "");
        ctx.logger.warn("builder.build.pr_failed", {
          jobId: ctx.job.id,
          status: prResponse.status,
          body: body.slice(0, 200),
        });
      }
    }
  }

  // Step 6: Build result summary and post back to gatekeeper
  reportStep("post_result", {
    changed: commitResult.changed,
    prUrl: prUrl ?? null,
  });
  const resultParts = [
    `Build completed.`,
    commitResult.changed
      ? `Changes committed: ${commitResult.headBefore.slice(0, 8)}..${commitResult.headAfter.slice(0, 8)}`
      : "No changes detected.",
  ];
  if (prUrl) {
    resultParts.push(`PR created: ${prUrl}`);
  }
  if (claudeOutput) {
    resultParts.push("", "--- Claude Reply ---", claudeOutput);
  }
  const result = resultParts.join("\n");

  const response = await fetch(
    `${ctx.gatekeeperInternalUrl}/api/builder/result`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId,
        responseJobType,
        result,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to post builder result (${response.status}): ${body.slice(0, 200)}`,
    );
  }

  ctx.logger.info("builder.build.result_posted", {
    jobId: ctx.job.id,
    requestId,
  });
}
