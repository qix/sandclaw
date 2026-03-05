export interface BackoffState {
  attempts: number;
}

export function createBackoffState(): BackoffState {
  return { attempts: 0 };
}

export function resetBackoff(state: BackoffState): void {
  state.attempts = 0;
}

export function nextBackoffMs(
  state: BackoffState,
  baseMs: number,
  maxMs: number,
): number {
  state.attempts += 1;
  const exponential = Math.min(maxMs, baseMs * 2 ** (state.attempts - 1));
  const jitter = Math.floor(exponential * 0.2 * Math.random());
  return exponential + jitter;
}

export async function sleepWithStop(
  ms: number,
  shouldStop: () => boolean,
): Promise<void> {
  if (shouldStop()) return;
  await new Promise<void>((resolve) => {
    const handle = setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, ms);
    const interval = setInterval(() => {
      if (!shouldStop()) return;
      clearTimeout(handle);
      clearInterval(interval);
      resolve();
    }, 100);
  });
}
