#!/usr/bin/env npx tsx

import cac from "cac";
import { runPi } from "@sandclaw/confidante-util";

const cli = cac("run-browser");
cli.option("--image <name>", "Docker image to use", {
  default: "sandclaw-browser-plugin",
});
cli.help();

const parsed = cli.parse();
if (parsed.options.help) process.exit(0);

const prompt = parsed.args[0] as string | undefined;
if (!prompt) {
  console.error("Usage: run-browser <prompt>");
  process.exit(1);
}

const { finalReply, exitCode } = await runPi({
  image: parsed.options.image as string,
  prompt,
  extension: "node_modules/pi-agent-browser",
});

if (finalReply) {
  process.stdout.write(finalReply + "\n");
}

process.exit(exitCode);
