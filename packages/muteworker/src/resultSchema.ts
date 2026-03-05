import type { MuteworkerJobResult } from "./types";

export function assertValidJobResult(
  value: unknown,
): asserts value is MuteworkerJobResult {
  if (!value || typeof value !== "object") {
    throw new Error("Result must be an object");
  }
  const result = value as Record<string, unknown>;
  if (typeof result.jobId !== "number")
    throw new Error("Result.jobId must be a number");
  if (result.status !== "success" && result.status !== "failed") {
    throw new Error("Result.status must be success or failed");
  }
  if (typeof result.summary !== "string")
    throw new Error("Result.summary must be a string");
  if (!Array.isArray(result.artifacts))
    throw new Error("Result.artifacts must be an array");
  if (!result.logs || typeof result.logs !== "object")
    throw new Error("Result.logs must be an object");
  const logs = result.logs as Record<string, unknown>;
  if (typeof logs.durationMs !== "number")
    throw new Error("Result.logs.durationMs must be a number");
  if (typeof logs.steps !== "number")
    throw new Error("Result.logs.steps must be a number");
  if ("error" in result && result.error != null) {
    if (typeof result.error !== "object")
      throw new Error("Result.error must be an object");
    const error = result.error as Record<string, unknown>;
    if (typeof error.kind !== "string")
      throw new Error("Result.error.kind must be a string");
    if (typeof error.message !== "string")
      throw new Error("Result.error.message must be a string");
  }
}
