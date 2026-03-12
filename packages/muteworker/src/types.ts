export type JobStatus = "pending" | "in_progress" | "complete" | "failed";

export interface MuteworkerQueueJob {
  id: number;
  jobType: string;
  /** JSON-encoded payload. Parse before use. */
  data: string;
  context?: string | null;
  executor?: string;
  status: JobStatus;
}

export interface MuteworkerQueueNextResponse {
  job: MuteworkerQueueJob | null;
}

export interface MuteworkerJobResult {
  jobId: number;
  status: "success" | "failed";
  summary: string;
  artifacts: Array<{
    type: "text";
    label: string;
    value: string;
  }>;
  logs: {
    durationMs: number;
    steps: number;
  };
  error?: {
    kind: "ModelError" | "Timeout" | "PolicyViolation" | "ParseError";
    message: string;
  };
}
