import path from "path";
import { homedir } from "os";
import type { GatekeeperPlugin } from "@sandclaw/gatekeeper-plugin-api";
import type { MuteworkerPlugin } from "@sandclaw/muteworker-plugin-api";
import type { ConfidantePlugin } from "@sandclaw/confidante-plugin-api";
import { buildChatPlugin } from "@sandclaw/chat-plugin";
import { createPromptsPlugin } from "@sandclaw/prompts-plugin";
import { createSkillsPlugin } from "@sandclaw/skills-plugin";
import { createMemoryPlugin } from "@sandclaw/memory-plugin";
import { createHttpPlugin } from "@sandclaw/http-plugin";
import { createWebSearchPlugin } from "@sandclaw/web-search-plugin";
import { createBrowserPlugin } from "@sandclaw/browser-plugin";
import { createGithubPlugin } from "@sandclaw/github-plugin";
import { createGoogleWorkspacePlugin } from "@sandclaw/google-workspace-plugin";
import { createGoogleMapsPlugin } from "@sandclaw/google-maps-plugin";
import { config } from "./config";
import { buildTelegramPlugin } from "@sandclaw/telegram-plugin";
import { createObsidianPlugin } from "@sandclaw/obsidian-plugin";
import { createGmailPlugin } from "@sandclaw/gmail-plugin";
import { createBuilderPlugin } from "@sandclaw/builder-plugin";
import { createEmailPlugin } from "@sandclaw/email-plugin";
import { createAgentStatusPlugin } from "@sandclaw/agent-status-plugin";
import { buildWhatsappPlugin } from "@sandclaw/whatsapp-plugin";
import { buildWhatsappMqttPlugin } from "@sandclaw/whatsapp-mqtt-plugin";
import { createJobGroupingPlugin } from "@sandclaw/job-grouping-plugin";
import { createHeartbeatPlugin } from "@sandclaw/heartbeat-plugin";
import { obsidianRoot, obsidianStore } from "./config"; 

export type SandclawPlugin = GatekeeperPlugin &
  MuteworkerPlugin &
  Partial<ConfidantePlugin>;

const workDir = "/home/josh/code/daveus-sandclaw-workdir";
const obsidianDir = path.join(obsidianRoot, "primary");

export const plugins: SandclawPlugin[] = [
  // Core plugins (work out of the box)
  createPromptsPlugin({ promptsDir: config.promptsDir }),
  createSkillsPlugin({ skillsDir: config.skillsDir }),
  createMemoryPlugin({ memoryDir: config.memoryDir }),

  buildChatPlugin(),
  /* buildWhatsappPlugin({
    operatorJids: ["218519480315934@lid"],
    operatorOnly: true,
    modelId: 'none',
  }), */
  buildWhatsappMqttPlugin({
    modelId: 'none',
  }),
  buildTelegramPlugin({
    botToken: process.env.TELEGRAM_BOT_TOKEN,

    operatorChatIds: ["8045164163"],
    photosDir: path.join(obsidianRoot, "conversations/sandclaw/photos"),
  }),
  createObsidianPlugin({
    vaultRoot: obsidianDir,
    localVaultPath: process.env.OBSIDIAN_LOCAL_PATH,
  }),
  createGmailPlugin({
    clientId: process.env.GMAIL_CLIENT_ID || "",
    clientSecret: process.env.GMAIL_CLIENT_SECRET || "",
    refreshToken: process.env.GMAIL_REFRESH_TOKEN || "",
    userEmail: process.env.GMAIL_USER_EMAIL || "",
  }),
  createGithubPlugin({
    autoPullPath: "/home/josh/code/sandclaw",
    autoPullRepo: "qix/sandclaw",
  }),
  createGoogleWorkspacePlugin({
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
  }),
  createBuilderPlugin({
    repo: "git@github.com:qix/sandclaw.git",
    workDir,
    branch: process.env.BUILDER_BRANCH || "main",
  }),
  createEmailPlugin({
    jmapHost: "api.fastmail.com",
    apiToken: process.env.FASTMAIL_READ_API_TOKEN || "",
    writeApiToken: process.env.FASTMAIL_WRITE_API_TOKEN || "",
    userEmail: process.env.FASTMAIL_EMAIL || "",
    emailQueueDir: path.join(obsidianStore, "email-queue"),
    systemPromptFile: path.join(obsidianStore, "prompts/EMAIL.md"),
    watchFolders: ["Tickets, Once-off", "Stores"],
  }),
  createBrowserPlugin(),
  createHttpPlugin(),
  createAgentStatusPlugin(),
  createJobGroupingPlugin({
    rulesDir: path.join(workDir, "job-grouping-rules"),
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  }),
  createHeartbeatPlugin({
    heartbeatFile: path.join(obsidianStore, "prompts/HEARTBEAT.md"),
    dailyFile: path.join(obsidianStore, "prompts/DAILY.md"),
    lastHeartbeatFile: path.join(config.memoryDir, "LAST_HEARTBEAT.md"),
  }),
];
