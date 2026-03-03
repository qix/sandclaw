export type JobStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

export interface MuteworkerQueueJob {
  id: number;
  jobType: string;
  /** JSON-encoded payload. Parse before use. */
  data: string;
  context?: string | null;
  status: JobStatus;
}

export interface MuteworkerQueueNextResponse {
  job: MuteworkerQueueJob | null;
}

export interface BrowserResearchRequestBody {
  prompt: string;
  responseJobType?: string;
  constraints?: {
    maxSteps?: number;
    timeoutMs?: number;
  };
}

export interface BrowserResearchRequestResponse {
  verificationRequestId: number;
  requestId: string;
  status: string;
}

export interface ObsidianSearchResponse {
  query: string;
  indexedAt: string;
  totalMatches: number;
  results: Array<{
    path: string;
    title: string;
    score: number;
    excerpt: string;
    modifiedAt: string;
  }>;
}

export interface ObsidianReadResponse {
  path: string;
  content: string;
  truncated: boolean;
  bytes: number;
  modifiedAt: string;
}

export interface ObsidianWriteResponse {
  verificationRequestId: number;
  path: string;
  mode: 'overwrite' | 'append';
  status: string;
  diff: {
    added: number;
    removed: number;
    unchanged: number;
    truncated: boolean;
  };
}

export interface MuteworkerJobResult {
  jobId: number;
  status: 'success' | 'failed';
  summary: string;
  artifacts: Array<{
    type: 'text';
    label: string;
    value: string;
  }>;
  logs: {
    durationMs: number;
    steps: number;
  };
  error?: {
    kind: 'ModelError' | 'Timeout' | 'PolicyViolation' | 'ParseError';
    message: string;
  };
}
