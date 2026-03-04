import type { ConfidanteConfig } from './config';
import type { Logger } from './logger';
import type {
  ConfidanteQueueJob,
  ConfidanteQueueNextResponse,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
  }
}

export class ConfidanteApiClient {
  constructor(
    private readonly config: ConfidanteConfig,
    private readonly logger?: Logger,
  ) {}

  async readNextJob(signal?: AbortSignal): Promise<ConfidanteQueueJob | null> {
    const timeoutSec = Math.max(1, Math.floor(this.config.longPollTimeoutMs / 1000));
    const response = await this.request(
      `/api/confidante-queue/next?timeout=${encodeURIComponent(String(timeoutSec))}`,
      { method: 'GET' },
      signal,
    );
    if (response.status === 204) return null;
    if (!response.ok) {
      throw await this.createError('Failed to read next confidante job', response);
    }
    const body = (await response.json()) as ConfidanteQueueNextResponse;
    return body.job ?? null;
  }

  async markComplete(jobId: number, result?: string): Promise<void> {
    const response = await this.request('/api/confidante-queue/complete', {
      method: 'POST',
      body: JSON.stringify({ id: jobId, result: result ?? null }),
    });
    if (!response.ok) {
      throw await this.createError('Failed to mark confidante job complete', response);
    }
  }

  /** Generic POST helper for plugin routes (e.g. posting results back). */
  async post(path: string, body: unknown): Promise<Response> {
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const startedAt = Date.now();
    const headers = new Headers(init.headers ?? {});
    headers.set('content-type', 'application/json');
    return fetch(new URL(path, this.config.apiBaseUrl), { ...init, headers, signal }).then(
      (response) => {
        this.logger?.debug('api.request', {
          path,
          method: init.method ?? 'GET',
          status: response.status,
          durationMs: Date.now() - startedAt,
        });
        return response;
      },
    );
  }

  private async createError(message: string, response: Response): Promise<ApiError> {
    const body = await response.text();
    return new ApiError(message, response.status, body);
  }
}
