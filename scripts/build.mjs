import { execSync } from "child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: process.cwd() });

// Layer 1: packages with no @sandclaw dependencies
const layer1 = [
  "@sandclaw/gatekeeper-plugin-api",
  "@sandclaw/muteworker-plugin-api",
  "@sandclaw/confidante-plugin-api",
  "@sandclaw/ui",
  "@sandclaw/confidante-util",
];

// Layer 2: packages that depend on layer 1
const layer2 = [
  "@sandclaw/browser-plugin",
  "@sandclaw/builder-plugin",
  "@sandclaw/chat-plugin",
  "@sandclaw/confidante",
  "@sandclaw/gatekeeper",
  "@sandclaw/github-plugin",
  "@sandclaw/gmail-plugin",
  "@sandclaw/google-maps-plugin",
  "@sandclaw/memory-plugin",
  "@sandclaw/muteworker",
  "@sandclaw/muteworker-claude",
  "@sandclaw/obsidian-plugin",
  "@sandclaw/prompts-plugin",
  "@sandclaw/telegram-plugin",
  "@sandclaw/web-search-plugin",
  "@sandclaw/whatsapp-plugin",
];

console.log("Building layer 1 (leaf packages)...");
for (const pkg of layer1) {
  run(`npm run build -w ${pkg}`);
}

console.log("Building layer 2...");
for (const pkg of layer2) {
  run(`npm run build -w ${pkg}`);
}

console.log("Build complete.");
