import type { MuteworkerConfig } from './config';
import type { Logger } from './logger';
import type {
  BrowserResearchRequestBody,
  BrowserResearchRequestResponse,
  MuteworkerQueueJob,
  MuteworkerQueueNextResponse,
  ObsidianReadResponse,
  ObsidianSearchResponse,
  ObsidianWriteResponse,
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

export class MuteworkerApiClient {
  constructor(
    private readonly config: MuteworkerConfig,
    private readonly logger?: Logger,
  ) {}

  async readNextJob(): Promise<MuteworkerQueueJob | null> {
    const timeoutSec = Math.max(1, Math.floor(this.config.longPollTimeoutMs / 1000));
    const response = await this.request(
      `/api/muteworker-queue/next?timeout=${encodeURIComponent(String(timeoutSec))}`,
      { method: 'GET' },
    );
    if (response.status === 204) return null;
    if (!response.ok) {
      throw await this.createError('Failed to read next muteworker job', response);
    }
    const body = (await response.json()) as MuteworkerQueueNextResponse;
    return body.job ?? null;
  }

  async markComplete(jobId: number): Promise<void> {
    const response = await this.request('/api/muteworker-queue/complete', {
      method: 'POST',
      body: JSON.stringify({ id: jobId }),
    });
    if (!response.ok) {
      throw await this.createError('Failed to mark muteworker job complete', response);
    }
  }

  async requestBrowserResearch(
    payload: BrowserResearchRequestBody,
  ): Promise<BrowserResearchRequestResponse> {
    const response = await this.request('/api/browser/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw await this.createError('Failed to request browser research', response);
    }
    return (await response.json()) as BrowserResearchRequestResponse;
  }

  async searchObsidianNotes(payload: {
    query: string;
    limit?: number;
  }): Promise<ObsidianSearchResponse> {
    const response = await this.request('/api/obsidian/search', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw await this.createError('Failed to search Obsidian notes', response);
    }
    return (await response.json()) as ObsidianSearchResponse;
  }

  async readObsidianNote(payload: {
    path: string;
    maxChars?: number;
  }): Promise<ObsidianReadResponse> {
    const response = await this.request('/api/obsidian/read', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw await this.createError('Failed to read Obsidian note', response);
    }
    return (await response.json()) as ObsidianReadResponse;
  }

  async requestObsidianWrite(payload: {
    path: string;
    content: string;
    append?: boolean;
  }): Promise<ObsidianWriteResponse> {
    const response = await this.request('/api/obsidian/write', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw await this.createError('Failed to request Obsidian write', response);
    }
    return (await response.json()) as ObsidianWriteResponse;
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    const startedAt = Date.now();
    const headers = new Headers(init.headers ?? {});
    headers.set('content-type', 'application/json');
    return fetch(new URL(path, this.config.apiBaseUrl), { ...init, headers }).then(
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
