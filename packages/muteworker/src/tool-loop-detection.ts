import { createHash } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────

export type LoopDetectorKind = 'generic_repeat' | 'ping_pong' | 'global_circuit_breaker';

export type LoopDetectionResult =
  | { stuck: false }
  | {
      stuck: true;
      level: 'warning' | 'critical';
      detector: LoopDetectorKind;
      count: number;
      message: string;
      warningKey: string;
    };

export interface LoopDetectionConfig {
  enabled?: boolean;
  /** Sliding window size for tool call history. Default: 30. */
  historySize?: number;
  /** Emit warning at this many identical calls. Default: 10. */
  warningThreshold?: number;
  /** Block execution at this many identical calls. Default: 20. */
  criticalThreshold?: number;
  /** Hard stop regardless of pattern. Default: 30. */
  globalCircuitBreakerThreshold?: number;
  detectors?: {
    genericRepeat?: boolean;
    pingPong?: boolean;
  };
}

export interface ToolCallRecord {
  toolName: string;
  argsHash: string;
  toolCallId?: string;
  resultHash?: string;
  timestamp: number;
}

export interface LoopDetectionState {
  toolCallHistory: ToolCallRecord[];
  warningBuckets: Map<string, number>;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULTS = {
  enabled: true,
  historySize: 30,
  warningThreshold: 10,
  criticalThreshold: 20,
  globalCircuitBreakerThreshold: 30,
  detectors: { genericRepeat: true, pingPong: true },
} as const;

const LOOP_WARNING_BUCKET_SIZE = 10;

// ── Helpers ──────────────────────────────────────────────────────────

interface ResolvedConfig {
  enabled: boolean;
  historySize: number;
  warningThreshold: number;
  criticalThreshold: number;
  globalCircuitBreakerThreshold: number;
  detectors: { genericRepeat: boolean; pingPong: boolean };
}

function asPositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return fallback;
  return value;
}

function resolveConfig(config?: LoopDetectionConfig): ResolvedConfig {
  let warningThreshold = asPositiveInt(config?.warningThreshold, DEFAULTS.warningThreshold);
  let criticalThreshold = asPositiveInt(config?.criticalThreshold, DEFAULTS.criticalThreshold);
  let globalCircuitBreakerThreshold = asPositiveInt(
    config?.globalCircuitBreakerThreshold,
    DEFAULTS.globalCircuitBreakerThreshold,
  );

  if (criticalThreshold <= warningThreshold) criticalThreshold = warningThreshold + 1;
  if (globalCircuitBreakerThreshold <= criticalThreshold)
    globalCircuitBreakerThreshold = criticalThreshold + 1;

  return {
    enabled: config?.enabled ?? DEFAULTS.enabled,
    historySize: asPositiveInt(config?.historySize, DEFAULTS.historySize),
    warningThreshold,
    criticalThreshold,
    globalCircuitBreakerThreshold,
    detectors: {
      genericRepeat: config?.detectors?.genericRepeat ?? DEFAULTS.detectors.genericRepeat,
      pingPong: config?.detectors?.pingPong ?? DEFAULTS.detectors.pingPong,
    },
  };
}

// ── Hashing ──────────────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function digest(value: unknown): string {
  let serialized: string;
  try {
    serialized = stableStringify(value);
  } catch {
    serialized = String(value);
  }
  return createHash('sha256').update(serialized).digest('hex');
}

export function hashToolCall(toolName: string, params: unknown): string {
  return `${toolName}:${digest(params)}`;
}

function extractTextContent(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result)) return '';
  const r = result as { content?: unknown };
  if (!Array.isArray(r.content)) return '';
  return r.content
    .filter(
      (e): e is { type: string; text: string } =>
        !!e && typeof e === 'object' && 'text' in e && typeof (e as any).text === 'string',
    )
    .map((e) => e.text)
    .join('\n')
    .trim();
}

function hashToolOutcome(
  result: unknown,
  error: unknown,
): string | undefined {
  if (error !== undefined) {
    const errStr =
      error instanceof Error
        ? error.message || error.name
        : typeof error === 'string'
          ? error
          : stableStringify(error);
    return `error:${digest(errStr)}`;
  }
  if (result === undefined) return undefined;
  if (!result || typeof result !== 'object') return digest(result);

  const details =
    'details' in result && result.details && typeof result.details === 'object'
      ? result.details
      : {};
  const text = extractTextContent(result);
  return digest({ details, text });
}

// ── Streak Detection ─────────────────────────────────────────────────

function getNoProgressStreak(
  history: ToolCallRecord[],
  toolName: string,
  argsHash: string,
): { count: number; latestResultHash?: string } {
  let streak = 0;
  let latestResultHash: string | undefined;

  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i];
    if (record.toolName !== toolName || record.argsHash !== argsHash) continue;
    if (typeof record.resultHash !== 'string' || !record.resultHash) continue;
    if (!latestResultHash) {
      latestResultHash = record.resultHash;
      streak = 1;
      continue;
    }
    if (record.resultHash !== latestResultHash) break;
    streak++;
  }

  return { count: streak, latestResultHash };
}

function getPingPongStreak(
  history: ToolCallRecord[],
  currentSignature: string,
): {
  count: number;
  pairedToolName?: string;
  noProgressEvidence: boolean;
} {
  const last = history.at(-1);
  if (!last) return { count: 0, noProgressEvidence: false };

  // Find the "other" signature in the tail
  let otherSignature: string | undefined;
  let otherToolName: string | undefined;
  for (let i = history.length - 2; i >= 0; i--) {
    const call = history[i];
    if (call.argsHash !== last.argsHash) {
      otherSignature = call.argsHash;
      otherToolName = call.toolName;
      break;
    }
  }
  if (!otherSignature || !otherToolName) return { count: 0, noProgressEvidence: false };

  // Count alternating tail
  let alternatingTailCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const call = history[i];
    const expected = alternatingTailCount % 2 === 0 ? last.argsHash : otherSignature;
    if (call.argsHash !== expected) break;
    alternatingTailCount++;
  }

  if (alternatingTailCount < 2) return { count: 0, noProgressEvidence: false };

  // Current call should continue the alternation
  if (currentSignature !== otherSignature) return { count: 0, noProgressEvidence: false };

  // Check for no-progress evidence on both sides
  const tailStart = Math.max(0, history.length - alternatingTailCount);
  let firstHashA: string | undefined;
  let firstHashB: string | undefined;
  let noProgressEvidence = true;
  for (let i = tailStart; i < history.length; i++) {
    const call = history[i];
    if (!call.resultHash) {
      noProgressEvidence = false;
      break;
    }
    if (call.argsHash === last.argsHash) {
      if (!firstHashA) firstHashA = call.resultHash;
      else if (firstHashA !== call.resultHash) {
        noProgressEvidence = false;
        break;
      }
    } else if (call.argsHash === otherSignature) {
      if (!firstHashB) firstHashB = call.resultHash;
      else if (firstHashB !== call.resultHash) {
        noProgressEvidence = false;
        break;
      }
    } else {
      noProgressEvidence = false;
      break;
    }
  }

  if (!firstHashA || !firstHashB) noProgressEvidence = false;

  return {
    count: alternatingTailCount + 1,
    pairedToolName: last.toolName,
    noProgressEvidence,
  };
}

// ── Public API ───────────────────────────────────────────────────────

export function createLoopDetectionState(): LoopDetectionState {
  return { toolCallHistory: [], warningBuckets: new Map() };
}

/**
 * Check if the agent is stuck in a repetitive tool-call loop.
 * Returns detection result with level and message.
 */
export function detectToolCallLoop(
  state: LoopDetectionState,
  toolName: string,
  params: unknown,
  config?: LoopDetectionConfig,
): LoopDetectionResult {
  const cfg = resolveConfig(config);
  if (!cfg.enabled) return { stuck: false };

  const history = state.toolCallHistory;
  const currentHash = hashToolCall(toolName, params);
  const noProgress = getNoProgressStreak(history, toolName, currentHash);
  const pingPong = getPingPongStreak(history, currentHash);

  // 1. Global circuit breaker — unconditional hard stop
  if (noProgress.count >= cfg.globalCircuitBreakerThreshold) {
    return {
      stuck: true,
      level: 'critical',
      detector: 'global_circuit_breaker',
      count: noProgress.count,
      message: `CRITICAL: ${toolName} has repeated identical no-progress outcomes ${noProgress.count} times. Execution blocked by global circuit breaker to prevent runaway loops.`,
      warningKey: `global:${toolName}:${currentHash}:${noProgress.latestResultHash ?? 'none'}`,
    };
  }

  // 2. Ping-pong critical — alternating tool calls with no progress
  const pingPongWarningKey = `pingpong:${[currentHash, pingPong.pairedToolName ?? ''].sort().join('|')}`;

  if (
    cfg.detectors.pingPong &&
    pingPong.count >= cfg.criticalThreshold &&
    pingPong.noProgressEvidence
  ) {
    return {
      stuck: true,
      level: 'critical',
      detector: 'ping_pong',
      count: pingPong.count,
      message: `CRITICAL: You are alternating between repeated tool-call patterns (${pingPong.count} consecutive calls) with no progress. Execution blocked to prevent resource waste.`,
      warningKey: pingPongWarningKey,
    };
  }

  // 3. Ping-pong warning
  if (cfg.detectors.pingPong && pingPong.count >= cfg.warningThreshold) {
    return {
      stuck: true,
      level: 'warning',
      detector: 'ping_pong',
      count: pingPong.count,
      message: `WARNING: You are alternating between repeated tool-call patterns (${pingPong.count} consecutive calls). This looks like a ping-pong loop. Stop retrying and report the task as failed.`,
      warningKey: pingPongWarningKey,
    };
  }

  // 4. Generic repeat — same tool+args called many times
  const recentCount = history.filter(
    (h) => h.toolName === toolName && h.argsHash === currentHash,
  ).length;

  if (cfg.detectors.genericRepeat && recentCount >= cfg.criticalThreshold) {
    return {
      stuck: true,
      level: 'critical',
      detector: 'generic_repeat',
      count: recentCount,
      message: `CRITICAL: Called ${toolName} ${recentCount} times with identical arguments. Execution blocked to prevent runaway loop.`,
      warningKey: `generic:${toolName}:${currentHash}`,
    };
  }

  if (cfg.detectors.genericRepeat && recentCount >= cfg.warningThreshold) {
    return {
      stuck: true,
      level: 'warning',
      detector: 'generic_repeat',
      count: recentCount,
      message: `WARNING: You have called ${toolName} ${recentCount} times with identical arguments. If this is not making progress, stop retrying and report the task as failed.`,
      warningKey: `generic:${toolName}:${currentHash}`,
    };
  }

  return { stuck: false };
}

/**
 * Record a tool call in the sliding-window history.
 */
export function recordToolCall(
  state: LoopDetectionState,
  toolName: string,
  params: unknown,
  toolCallId?: string,
  config?: LoopDetectionConfig,
): void {
  const cfg = resolveConfig(config);
  state.toolCallHistory.push({
    toolName,
    argsHash: hashToolCall(toolName, params),
    toolCallId,
    timestamp: Date.now(),
  });
  if (state.toolCallHistory.length > cfg.historySize) {
    state.toolCallHistory.shift();
  }
}

/**
 * Record the outcome of a tool call so loop detection can identify no-progress repeats.
 */
export function recordToolCallOutcome(
  state: LoopDetectionState,
  params: {
    toolName: string;
    toolParams: unknown;
    toolCallId?: string;
    result?: unknown;
    error?: unknown;
  },
  config?: LoopDetectionConfig,
): void {
  const cfg = resolveConfig(config);
  const resultHash = hashToolOutcome(params.result, params.error);
  if (!resultHash) return;

  const argsHash = hashToolCall(params.toolName, params.toolParams);

  // Find the matching unresolved call in history and stamp it with the result hash
  let matched = false;
  for (let i = state.toolCallHistory.length - 1; i >= 0; i--) {
    const call = state.toolCallHistory[i];
    if (params.toolCallId && call.toolCallId !== params.toolCallId) continue;
    if (call.toolName !== params.toolName || call.argsHash !== argsHash) continue;
    if (call.resultHash !== undefined) continue;
    call.resultHash = resultHash;
    matched = true;
    break;
  }

  // If no matching call found, append a synthetic record
  if (!matched) {
    state.toolCallHistory.push({
      toolName: params.toolName,
      argsHash,
      toolCallId: params.toolCallId,
      resultHash,
      timestamp: Date.now(),
    });
  }

  // Trim history
  if (state.toolCallHistory.length > cfg.historySize) {
    state.toolCallHistory.splice(0, state.toolCallHistory.length - cfg.historySize);
  }
}

/**
 * Throttle warning emissions so we don't spam with identical warnings.
 * Returns true if the warning should be emitted for this bucket.
 */
export function shouldEmitWarning(
  state: LoopDetectionState,
  warningKey: string,
  count: number,
): boolean {
  const bucket = Math.floor(count / LOOP_WARNING_BUCKET_SIZE);
  const lastBucket = state.warningBuckets.get(warningKey) ?? 0;
  if (bucket <= lastBucket) return false;
  state.warningBuckets.set(warningKey, bucket);
  return true;
}
