import { fileURLToPath } from "url";
import path from "path";
import { homedir } from "os";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localStore = path.join(homedir(), ".config/daveus-sandclaw");
const obsidianStore = path.join(homedir(), "obsidian/primary/daveus");

const localConfig = JSON.parse(
  readFileSync(path.join(localStore, "config.json"), "utf-8"),
);

const gatekeeperPort = 8888;

const shared = {
  /* Pi agent model configuration */
  modelProvider: "anthropic",
  modelId: "claude-haiku-4-5",

  /* Address that the muteworker and confidante instances use to talk to gatekeeper. Should be localhost if running on the same machine. */
  gatekeeperInternalUrl: `http://localhost:${gatekeeperPort}`,

  /* Address that the gatekeeper instance is available from remote. Recommend using tailscale, etc. */
  gatekeeperExternalUrl: localConfig.gatekeeperExternalUrl,
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
};

export const confidanteConfig = {
  ...shared,
};

export const config = gatekeeperConfig;
