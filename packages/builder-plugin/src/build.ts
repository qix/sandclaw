import type { ConfidantePluginContext } from "@sandclaw/confidante-plugin-api";
import { runDockerCommand } from "@sandclaw/confidante-util";
import { runDockerClaude } from "./docker";
import { DEFAULT_BUILDER_RESULT_JOB_TYPE } from "./constants";
import { prepareWorkDir, detectAndCommitChanges, pushBranch } from "./workdir";

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
  const outputBranch = `builder-${ctx.job.id}`;
  await prepareWorkDir({
    repo,
    workDir,
    branchName: outputBranch,
    baseBranch: branch,
  });

  // Step 2: npm install in Docker
  ctx.logger.info("builder.build.npm_install", {
    jobId: ctx.job.id,
    requestId,
  });
  const npmResult = await runDockerCommand({
    image,
    command: ["npm", "install"],
    dockerArgs: dockerMountArgs,
  });

  if (npmResult.exitCode !== 0) {
    throw new Error(`npm install failed with exit code ${npmResult.exitCode}`);
  }

  // Step 3: Run claude in Docker with proxy (cm-style prompt interception)
  ctx.logger.info("builder.build.running_claude", {
    jobId: ctx.job.id,
    requestId,
  });
  const {
    finalReply,
    exitCode: claudeExitCode,
    prompts: collectedPrompts,
  } = await runDockerClaude({
    image,
    prompt,
    dockerArgs: [
      "--cap-add=NET_ADMIN",
      "--cap-add=NET_RAW",
      ...dockerMountArgs,
    ],
  });

  ctx.logger.info("builder.build.claude_completed", {
    jobId: ctx.job.id,
    requestId,
    claudeExitCode,
  });

  // Step 4: Detect and commit changes
  // Use proxy-collected prompts as the commit message for better traceability
  // (these are the actual user prompts extracted from API calls, not the raw input)
  const commitMessage =
    collectedPrompts.length > 0
      ? collectedPrompts.join("\n\n")
      : prompt;
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
    await pushBranch(workDir, outputBranch);

    ctx.logger.info("builder.build.pushed", {
      jobId: ctx.job.id,
      branch: outputBranch,
    });

    const ghRepo = extractGitHubRepo(repo);
    if (ghRepo) {
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
              finalReply || "",
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
  const resultParts = [
    `Build completed (claude exit code: ${claudeExitCode}).`,
    commitResult.changed
      ? `Changes committed: ${commitResult.headBefore.slice(0, 8)}..${commitResult.headAfter.slice(0, 8)}`
      : "No changes detected.",
  ];
  if (prUrl) {
    resultParts.push(`PR created: ${prUrl}`);
  }
  if (finalReply) {
    resultParts.push("", "--- Claude Reply ---", finalReply);
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
