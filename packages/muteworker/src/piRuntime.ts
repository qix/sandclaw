import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import type { MuteworkerConfig } from './config';
import type { Logger } from './logger';
import { loadSystemPrompt } from './promptLoader';
import type { Artifact, ToolArgs } from './tools/index';
import { getTools } from './tools/index';
import type { MuteworkerQueueJob } from './types';

export interface PiExecutionResult {
  reply: string | null;
  artifacts: Artifact[];
  steps: number;
}

export async function runWithPi(
  prompt: string,
  toolArgs: ToolArgs,
): Promise<PiExecutionResult | null> {
  const { config, promptsDir, memoryDir } = toolArgs;
  // Cast required: config values are plain strings but getModel expects literal types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (getModel as any)(config.modelProvider, config.modelId);
  const systemPrompt = await loadSystemPrompt(promptsDir, memoryDir);
  const artifacts: Artifact[] = [];

  const tools = getTools(artifacts, { ...toolArgs, context: prompt });

  const agent = new Agent({
    initialState: { systemPrompt, model, tools },
  });

  await agent.prompt(prompt);
  const reply = extractAssistantText(agent.state.messages).trim() || null;

  if (!reply && artifacts.length === 0) return null;

  return {
    reply,
    artifacts,
    steps: artifacts.length > 0 ? artifacts.length + 1 : 1,
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
