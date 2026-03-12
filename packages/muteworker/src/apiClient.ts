import type { MuteworkerConfig } from "./config.js";
import type { Logger } from "./logger.js";
import type {
  MuteworkerQueueJob,
  MuteworkerQueueNextResponse,
} from "./types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
  }
}

export class MuteworkerApiClient {
  constructor(
    private readonly config: MuteworkerConfig,
    private readonly logger?: Logger,
  ) {}

  async readNextJob(signal?: AbortSignal): Promise<MuteworkerQueueJob | null> {
    const timeoutSec = Math.max(
      1,
      Math.floor(this.config.longPollTimeoutMs / 1000),
    );
    const response = await this.request(
      `/api/muteworker-queue/next?timeout=${encodeURIComponent(String(timeoutSec))}`,
      { method: "GET" },
      signal,
    );
    if (response.status === 204) return null;
    if (!response.ok) {
      throw await this.createError(
        "Failed to read next muteworker job",
        response,
      );
    }
    const body = (await response.json()) as MuteworkerQueueNextResponse;
    return body.job ?? null;
  }

  async getJob(jobId: number): Promise<MuteworkerQueueJob | null> {
    const response = await this.request(
      `/api/muteworker-queue/${encodeURIComponent(String(jobId))}`,
      { method: "GET" },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw await this.createError("Failed to fetch muteworker job", response);
    }
    const body = (await response.json()) as MuteworkerQueueNextResponse;
    return body.job ?? null;
  }

  async postAgentStatus(event: {
    jobId: number;
    event: string;
    prompt?: string;
    systemPrompt?: string;
    toolNames?: string[];
    data?: Record<string, unknown>;
    createdAt?: number;
  }): Promise<void> {
    try {
      await this.request("/api/muteworker-queue/agent-status", {
        method: "POST",
        body: JSON.stringify(event),
      });
    } catch {
      // Status reporting must never break job execution
    }
  }

  async markComplete(jobId: number): Promise<void> {
    const response = await this.request("/api/muteworker-queue/complete", {
      method: "POST",
      body: JSON.stringify({ id: jobId }),
    });
    if (!response.ok) {
      throw await this.createError(
        "Failed to mark muteworker job complete",
        response,
      );
    }
  }

  private request(
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<Response> {
    const startedAt = Date.now();
    const headers = new Headers(init.headers ?? {});
    headers.set("content-type", "application/json");
    return fetch(new URL(path, this.config.gatekeeperInternalUrl), {
      ...init,
      headers,
      signal,
    }).then((response) => {
      this.logger?.debug("api.request", {
        path,
        method: init.method ?? "GET",
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    });
  }

  private async createError(
    message: string,
    response: Response,
  ): Promise<ApiError> {
    const body = await response.text();
    return new ApiError(message, response.status, body);
  }
}
