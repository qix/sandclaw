import { fileURLToPath } from "url";
import path from "path";
import { homedir } from "os";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localStore = path.join(homedir(), ".config/daveus-sandclaw");
const obsidianStore = path.join(homedir(), "obsidian/primary/daveus");

let localConfig: Record<string, any> = {};
try {
  localConfig = JSON.parse(
    readFileSync(path.join(localStore, "config.json"), "utf-8"),
  );
} catch {
  // Config file not available (e.g. inside container) — use env vars.
}

const gatekeeperPort = 8888;

const shared = {
  /* Model configuration */
  modelProvider: "anthropic",
  modelId: "claude-opus-4-7",

  /* Address that the muteworker and confidante instances use to talk to gatekeeper. Should be localhost if running on the same machine. */
  gatekeeperInternalUrl:
    process.env.GATEKEEPER_INTERNAL_URL ||
    `http://localhost:${gatekeeperPort}`,

  /* Address that the gatekeeper instance is available from remote. Recommend using tailscale, etc. */
  gatekeeperExternalUrl:
    process.env.GATEKEEPER_EXTERNAL_URL ||
    localConfig.gatekeeperExternalUrl,
};

export const gatekeeperConfig = {
  ...shared,

  /* Port to run gatekeeper on */
  gatekeeperPort,

  /* Local storage paths */
  dbPath: path.join(localStore, "data/db.sqlite"),
  memoryDir: path.join(localStore, "memory"),
  promptsDir: path.join(obsidianStore, "prompts"),
  skillsDir: path.join(__dirname, "skills"),
};

export const muteworkerConfig = {
  ...shared,
  /* Allow Claude Code's built-in file tools for direct vault access. */
  allowedBuiltInTools: ["Read", "Grep", "Glob"],
};

export const confidanteConfig = {
  ...shared,
};

export const config = gatekeeperConfig;
