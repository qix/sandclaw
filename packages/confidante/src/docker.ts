import { execFile } from "node:child_process";
import type {
  DockerService,
  DockerRunResult,
} from "@sandclaw/confidante-plugin-api";
import type { Logger } from "./logger";

const DEFAULT_TIMEOUT_MS = 60_000;

export class DockerServiceImpl implements DockerService {
  constructor(private readonly logger: Logger) {}

  async run(
    image: string,
    command: string[],
    options?: { timeoutMs?: number; env?: Record<string, string> },
  ): Promise<DockerRunResult> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const args = ["run", "--rm"];

    // Pass environment variables
    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    args.push(image, ...command);

    this.logger.info("docker.run", { image, command, timeoutMs });

    return new Promise<DockerRunResult>((resolve, reject) => {
      const proc = execFile(
        "docker",
        args,
        { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error && "killed" in error && error.killed) {
            reject(new Error(`Docker command timed out after ${timeoutMs}ms`));
            return;
          }

          const exitCode =
            error && "code" in error ? ((error.code as number) ?? 1) : 0;

          this.logger.info("docker.run.complete", {
            image,
            exitCode,
            stdoutLen: stdout.length,
            stderrLen: stderr.length,
          });

          resolve({ exitCode, stdout, stderr });
        },
      );

      // Safety: kill on unhandled proc errors
      proc.on("error", (err) => {
        reject(new Error(`Failed to start Docker: ${err.message}`));
      });
    });
  }
}
