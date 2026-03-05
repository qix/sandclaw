#!/usr/bin/env npx tsx

import cac from "cac";
import { resolve } from "node:path";
import {
  runDockerPi,
  runDockerCommand,
  prepareWorkDir,
  detectAndCommitChanges,
} from "@sandclaw/confidante-util";

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function muted(text: string) {
  process.stderr.write(`${DIM}${text}${RESET}\n`);
}

// --- CLI ---

const cli = cac("run-build");
cli.option("--repo <url>", "Git repo URL to clone (required)");
cli.option("--work-dir <dir>", "Working directory to clone into (required)");
cli.option("--image <name>", "Docker image to use", {
  default: "builder-plugin",
});
cli.option("--branch <branch>", "Branch to checkout", { default: "main" });
cli.option("--commit-message <msg>", "Commit message for changes");
cli.help();

const parsed = cli.parse();
if (parsed.options.help) process.exit(0);

const prompt = parsed.args[0] as string | undefined;
if (!prompt) {
  console.error("Usage: run-build <prompt> --repo <url> --work-dir <dir>");
  process.exit(1);
}

const repo = parsed.options.repo as string | undefined;
const workDirRaw = parsed.options.workDir as string | undefined;

if (!repo) {
  console.error("Error: --repo is required");
  process.exit(1);
}

if (!workDirRaw) {
  console.error("Error: --work-dir is required");
  process.exit(1);
}

const workDir = resolve(workDirRaw);
const image = parsed.options.image as string;
const branch = parsed.options.branch as string;
const commitMessage = (parsed.options.commitMessage as string) || prompt;

// --- Step 1: Prepare working directory ---

await prepareWorkDir({ repo, workDir, branch });

// --- Step 2: npm install in Docker ---

muted("Running npm install in Docker container...");
const npmResult = await runDockerCommand({
  image,
  command: ["npm", "install"],
  dockerArgs: ["-v", `${workDir}:/workspace`],
});

if (npmResult.exitCode !== 0) {
  console.error(`Error: npm install failed with code ${npmResult.exitCode}`);
  process.exit(1);
}

muted("npm install completed successfully");

// --- Step 3: Run pi in Docker with event streaming ---

muted(`Running pi in Docker container (${image})...`);

const { finalReply, exitCode: piExitCode } = await runDockerPi({
  image,
  prompt,
  dockerArgs: [
    "--cap-add=NET_ADMIN",
    "--cap-add=NET_RAW",
    "-v",
    `${workDir}:/workspace`,
    "-e",
    `PI_PROMPT=${prompt}`,
  ],
  command: [
    "bash",
    "-c",
    'sudo /usr/local/bin/init-firewall.sh && pi --mode json --print "$PI_PROMPT"',
  ],
});

muted(`pi exited with code: ${piExitCode}`);

// --- Step 4: Check for changes and commit ---

const { changed, headBefore, headAfter } = await detectAndCommitChanges({
  workDir,
  commitMessage,
});

muted(`Repo path: ${workDir}`);
if (changed) {
  muted(
    `Changes committed: ${headBefore.slice(0, 8)}..${headAfter.slice(0, 8)}`,
  );
}

if (finalReply) {
  process.stdout.write(finalReply + "\n");
}

process.exit(piExitCode);
