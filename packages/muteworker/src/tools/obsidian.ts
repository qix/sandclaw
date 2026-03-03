import { AgentTool } from '@mariozechner/pi-agent-core';
import { TSchema } from '@mariozechner/pi-ai';
import type { Artifact, ToolArgs } from './index';

export function createObsidianTools(artifacts: Artifact[], args: ToolArgs): AgentTool[] {
  const { client, config, logger, job } = args;

  return [
    {
      name: 'search_obsidian_notes',
      label: 'Search Obsidian Notes',
      description:
        'Search notes in the Obsidian vault index. Use this before reading specific files.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
        additionalProperties: false,
      } as unknown as TSchema,
      execute: async (_toolCallId: string, params: any) => {
        const query = String(params.query ?? '').trim();
        if (!query) throw new Error('query is required');
        const limit =
          params.limit != null ? normalizePositiveInteger(params.limit, 'limit') : undefined;

        logger.info('tool.obsidian.search', { jobId: job.id, query, limit: limit ?? null });
        const response = await client.searchObsidianNotes({ query, ...(limit ? { limit } : {}) });
        artifacts.push({ type: 'text', label: 'Obsidian Search', value: query });

        if (response.results.length === 0) {
          return {
            content: [{ type: 'text', text: `No notes matched "${query}".` }],
            details: response,
          };
        }

        const rendered = response.results
          .map((result, index) => {
            const score = Number.isFinite(result.score)
              ? result.score.toFixed(3)
              : String(result.score);
            return [
              `${index + 1}. ${result.path} (score ${score})`,
              result.title ? `Title: ${result.title}` : '',
              result.excerpt.trim() ? `Excerpt: ${result.excerpt.trim()}` : '',
            ]
              .filter((line) => line.length > 0)
              .join('\n');
          })
          .join('\n\n');

        return { content: [{ type: 'text', text: rendered }], details: response };
      },
    },
    {
      name: 'read_obsidian_note',
      label: 'Read Obsidian Note',
      description:
        'Read a specific note from the Obsidian vault by relative path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          maxChars: { type: 'number' },
        },
        required: ['path'],
        additionalProperties: false,
      } as unknown as TSchema,
      execute: async (_toolCallId: string, params: any) => {
        const notePath = String(params.path ?? '').trim();
        if (!notePath) throw new Error('path is required');
        const maxChars =
          params.maxChars != null
            ? normalizePositiveInteger(params.maxChars, 'maxChars')
            : undefined;

        logger.info('tool.obsidian.read', { jobId: job.id, path: notePath, maxChars: maxChars ?? null });
        const response = await client.readObsidianNote({ path: notePath, ...(maxChars ? { maxChars } : {}) });
        artifacts.push({ type: 'text', label: 'Obsidian Read', value: response.path });

        const suffix = response.truncated ? '\n\n[Output truncated by maxChars]' : '';
        return {
          content: [{ type: 'text', text: `${response.content}${suffix}` }],
          details: response,
        };
      },
    },
    {
      name: 'write_obsidian_note',
      label: 'Write Obsidian Note',
      description:
        'Create a verification request to write text to an Obsidian note. A human must approve the diff in SandClaw before the file is changed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          append: { type: 'boolean' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      } as unknown as TSchema,
      execute: async (_toolCallId: string, params: any) => {
        const notePath = String(params.path ?? '').trim();
        if (!notePath) throw new Error('path is required');
        if (typeof params.content !== 'string') throw new Error('content must be a string');
        const append = params.append === true;

        logger.info('tool.obsidian.write', {
          jobId: job.id,
          path: notePath,
          append,
          contentBytes: Buffer.byteLength(params.content, 'utf8'),
        });

        const response = await client.requestObsidianWrite({
          path: notePath,
          content: params.content,
          append,
        });
        artifacts.push({
          type: 'text',
          label: 'Obsidian Write Request',
          value: `${response.path} (${response.mode})`,
        });

        return {
          content: [
            {
              type: 'text',
              text: [
                `Queued Obsidian write verification #${response.verificationRequestId}.`,
                'No file has been changed yet.',
                `Path: ${response.path}`,
                `Mode: ${response.mode}`,
                `Diff: +${response.diff.added} -${response.diff.removed} =${response.diff.unchanged}`,
                `Open ${config.verificationUiUrl} to review and approve this change.`,
              ].join('\n'),
            },
          ],
          details: response,
        };
      },
    },
  ];
}

function normalizePositiveInteger(value: unknown, name: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error(`${name} must be a positive number`);
  return Math.floor(numeric);
}
