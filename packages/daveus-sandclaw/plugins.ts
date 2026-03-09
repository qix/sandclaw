import type { GatekeeperPlugin } from "@sandclaw/gatekeeper-plugin-api";
import type { MuteworkerPlugin } from "@sandclaw/muteworker-plugin-api";
import type { ConfidantePlugin } from "@sandclaw/confidante-plugin-api";
import { buildChatPlugin } from "@sandclaw/chat-plugin";
import { createPromptsPlugin } from "@sandclaw/prompts-plugin";
import { createMemoryPlugin } from "@sandclaw/memory-plugin";
import { createWebSearchPlugin } from "@sandclaw/web-search-plugin";
import { createBrowserPlugin } from "@sandclaw/browser-plugin";
import { createGithubPlugin } from "@sandclaw/github-plugin";
//import { createGoogleSheetsPlugin } from "@sandclaw/google-sheets-plugin";
import { createGoogleMapsPlugin } from "@sandclaw/google-maps-plugin";
import { createClaudeBuilderPlugin } from "@sandclaw/claude-builder-plugin";
import { config } from "./config";
import { buildTelegramPlugin } from "@sandclaw/telegram-plugin";
import { createObsidianPlugin } from "@sandclaw/obsidian-plugin";
import { createGmailPlugin } from "@sandclaw/gmail-plugin";

export type SandclawPlugin = GatekeeperPlugin &
  MuteworkerPlugin &
  Partial<ConfidantePlugin>;

const workDir = "/home/josh/code/daveus-sandclaw-workdir";

export const plugins: SandclawPlugin[] = [
  // Core plugins (work out of the box)
  createPromptsPlugin({ promptsDir: "./prompts" }),
  createMemoryPlugin({ memoryDir: "./memory" }),

  buildChatPlugin(),
  /*
   * @disabled
  buildWhatsappPlugin({
    operatorJids: [
    "218519480315934@lid",
    ],
    operatorOnly: true,
  }),
  */
  buildTelegramPlugin({
    botToken: process.env.TELEGRAM_BOT_TOKEN,

    operatorChatIds: ["8045164163"],
  }),
  createObsidianPlugin({
    vaultRoot: "~/obsidian/primary",
  }),
  createGmailPlugin({
    clientId: process.env.GMAIL_CLIENT_ID || "",
    clientSecret: process.env.GMAIL_CLIENT_SECRET || "",
    refreshToken: process.env.GMAIL_REFRESH_TOKEN || "",
    userEmail: process.env.GMAIL_USER_EMAIL || "",
  }),
  createGithubPlugin({
    autoPullPath: "/home/josh/code/daveus-sandclaw",
    autoPullRepo: "qix/daveus-sandclaw",
  }),
  /*
  createGoogleSheetsPlugin({
    clientId: "",
    clientSecret: "",
    refreshToken: "",
  }),*/
  createClaudeBuilderPlugin({
    repo: "git@github.com:qix/daveus-sandclaw.git",
    workDir,
    branch: process.env.BUILDER_BRANCH || "main",
    dockerArgsOverride: [
      "--workdir",
      "/workspace/daveus-sandclaw",
      "-v",
      `${workDir}:/workspace/daveus-sandclaw`,
      "-v",
      "/home/josh/code/sandclaw:/workspace/sandclaw",
    ],
  }),
  createBrowserPlugin(),
];
