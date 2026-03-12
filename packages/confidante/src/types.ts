export type JobStatus = "pending" | "in_progress" | "complete" | "failed";

export interface ConfidanteQueueJob {
  id: number;
  jobType: string;
  /** JSON-encoded payload. Parse before use. */
  data: string;
  context?: string | null;
  executor?: string;
  status: JobStatus;
}

export interface ConfidanteQueueNextResponse {
  job: ConfidanteQueueJob | null;
}
