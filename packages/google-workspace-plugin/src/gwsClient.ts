import { execFile } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface GoogleWorkspacePluginConfig {
  /** Google OAuth2 client ID. If omitted, gws uses its own auth. */
  clientId?: string;
  /** Google OAuth2 client secret. If omitted, gws uses its own auth. */
  clientSecret?: string;
  /** OAuth2 refresh token. If omitted, gws uses its own auth. */
  refreshToken?: string;
}

/** Path to the temporary credentials file written for gws. */
let credentialsFilePath: string | null = null;

/**
 * Write an authorized_user credentials file for gws if config has OAuth creds.
 * Returns env overrides to pass to gws.
 */
export function getGwsEnv(
  config: GoogleWorkspacePluginConfig,
): Record<string, string> {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    return {};
  }

  if (!credentialsFilePath) {
    const dir = join(tmpdir(), "gws-sandclaw");
    mkdirSync(dir, { recursive: true });
    credentialsFilePath = join(dir, "credentials.json");
    writeFileSync(
      credentialsFilePath,
      JSON.stringify({
        type: "authorized_user",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
      }),
    );
  }

  return {
    GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: credentialsFilePath,
    GOOGLE_WORKSPACE_CLI_CONFIG_DIR: join(tmpdir(), "gws-sandclaw"),
  };
}

export interface GwsExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run a gws CLI command and return raw stdout/stderr/exitCode. */
export async function gwsExec(
  config: GoogleWorkspacePluginConfig,
  args: string[],
): Promise<GwsExecResult> {
  const envOverrides = getGwsEnv(config);

  return new Promise((resolve) => {
    execFile(
      "gws",
      args,
      {
        env: { ...process.env, ...envOverrides },
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: error ? ((error as any).code ?? 1) : 0,
        });
      },
    );
  });
}
