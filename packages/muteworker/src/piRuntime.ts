import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import type { Artifact, ToolArgs } from './tools/index';
import { getTools } from './tools/index';

const DEFAULT_MAX_TOOL_CALLS = 32;

export interface PiExecutionResult {
  reply: string | null;
  artifacts: Artifact[];
  steps: number;
}

export async function runWithPi(
  prompt: string,
  toolArgs: ToolArgs,
): Promise<PiExecutionResult | null> {
  const { config } = toolArgs;
  // Cast required: config values are plain strings but getModel expects literal types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (getModel as any)(config.modelProvider, config.modelId);
  const systemPrompt = await toolArgs.buildSystemPrompt();
  const artifacts: Artifact[] = [];

  const tools = getTools(artifacts, { ...toolArgs, context: prompt });

  const agent = new Agent({
    initialState: { systemPrompt, model, tools },
  });

  // ── Main-loop progress check ──────────────────────────────────────
  const maxToolCalls = config.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  let toolCallCount = 0;
  let steered = false;

  // ── Timeout-based progress check ───────────────────────────────────
  const STEER_TIMEOUT_MS = 25_000;
  const ABORT_TIMEOUT_MS = 30_000;
  let lastProgressTime = Date.now();
  let timeoutSteered = false;
  let steerTimer: ReturnType<typeof setTimeout> | undefined;
  let abortTimer: ReturnType<typeof setTimeout> | undefined;

  function clearTimeoutTimers() {
    if (steerTimer !== undefined) clearTimeout(steerTimer);
    if (abortTimer !== undefined) clearTimeout(abortTimer);
    steerTimer = undefined;
    abortTimer = undefined;
  }

  let abortError: Error | undefined;

  function scheduleTimeoutTimers() {
    clearTimeoutTimers();
    const now = Date.now();
    const elapsed = now - lastProgressTime;

    if (!timeoutSteered) {
      const steerDelay = Math.max(0, STEER_TIMEOUT_MS - elapsed);
      steerTimer = setTimeout(() => {
        timeoutSteered = true;
        toolArgs.logger.warn('agent.timeout_steer', {
          jobId: toolArgs.job.id,
          elapsedMs: Date.now() - lastProgressTime,
        });
        agent.setTools([]);
        agent.steer({
          role: 'user',
          content:
            'You have been running for too long without making progress. ' +
            'Do NOT call any tools. Write a concise message explaining what you ' +
            'have accomplished so far and where you got stuck.',
          timestamp: Date.now(),
        });
        // Schedule the hard abort
        scheduleTimeoutTimers();
      }, steerDelay);
    }

    const abortDelay = Math.max(0, ABORT_TIMEOUT_MS - elapsed);
    abortTimer = setTimeout(() => {
      toolArgs.logger.error('agent.timeout_abort', {
        jobId: toolArgs.job.id,
        elapsedMs: Date.now() - lastProgressTime,
      });
      abortError = new Error(
        `Agent timed out: no progress for ${ABORT_TIMEOUT_MS / 1000}s`,
      );
      agent.abort();
    }, abortDelay);
  }

  const unsubscribe = agent.subscribe((event) => {
    if (
      event.type === 'tool_execution_end' ||
      event.type === 'turn_end' ||
      event.type === 'message_end'
    ) {
      lastProgressTime = Date.now();
      if (!timeoutSteered) {
        scheduleTimeoutTimers();
      }
    }

    if (event.type !== 'tool_execution_end') return;
    toolCallCount++;

    if (toolCallCount >= maxToolCalls && !steered) {
      steered = true;
      toolArgs.logger.warn('agent.progress_check', {
        jobId: toolArgs.job.id,
        toolCallCount,
        maxToolCalls,
      });
      agent.steer({
        role: 'user',
        content:
          `You have made ${toolCallCount} tool calls so far. ` +
          'Step back and evaluate: are you making visible progress toward completing the task? ' +
          'If you are NOT making progress — for example you are stuck in a loop, retrying the ' +
          'same action, or unable to find what you need — then STOP calling tools immediately. ' +
          'Instead, write a concise message explaining what you tried, why it did not work, and ' +
          'what the user should do next.',
        timestamp: Date.now(),
      });
    }
  });

  scheduleTimeoutTimers();

  try {
    await agent.prompt(prompt);
  } finally {
    clearTimeoutTimers();
    unsubscribe();
  }

  if (abortError) throw abortError;

  const reply = extractAssistantText(agent.state.messages).trim() || null;

  if (!reply && artifacts.length === 0) return null;

  return {
    reply,
    artifacts,
    steps: toolCallCount,
  };
}

function extractAssistantText(messages: unknown[]): string {
  for (const message of [...messages].reverse()) {
    if (!message || typeof message !== 'object') continue;
    const record = message as Record<string, unknown>;
    if (record.role !== 'assistant') continue;
    if (typeof record.content === 'string') return record.content;
    if (Array.isArray(record.content)) {
      const textParts = record.content
        .map((part) => {
          if (part && typeof part === 'object' && 'text' in part) {
            const text = (part as { text?: unknown }).text;
            return typeof text === 'string' ? text : '';
          }
          return '';
        })
        .filter(Boolean);
      if (textParts.length > 0) return textParts.join('\n').trim();
    }
  }
  return '';
}
