import { AgentTool } from '@mariozechner/pi-agent-core';
import { TSchema } from '@mariozechner/pi-ai';
import type { Artifact, ToolArgs } from './index';

function buildBrowserResearchPrompt(context: string, query: string): string {
  return [
    context,
    'In order to fulfill the above request, the user requested the following browser query:',
    query,
  ].join('\n');
}

export function createRequestBrowserTool(artifacts: Artifact[], args: ToolArgs): AgentTool {
  const { client, config, context, logger, job } = args;

  return {
    name: 'request_browser',
    label: 'Request Browser Research',
    description:
      'Create a browser research request that must be human-approved before the confidante agent executes it. Use this for web lookups, news, and online research.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
      additionalProperties: false,
    } as unknown as TSchema,
    execute: async (_toolCallId: string, params: any) => {
      const { query } = params;
      const browserPrompt = buildBrowserResearchPrompt(context, query);
      const browserRequest = await client.requestBrowserResearch({
        prompt: browserPrompt,
        responseJobType: 'browser:research_result',
        constraints: {
          maxSteps: config.maxSteps,
          timeoutMs: config.jobTimeoutMs,
        },
      });

      logger.info('tool.browser.requested', {
        jobId: job.id,
        requestId: browserRequest.requestId,
        verificationRequestId: browserRequest.verificationRequestId,
      });

      artifacts.push({ type: 'text', label: 'Browser Request', value: query });

      return {
        content: [
          {
            type: 'text',
            text: [
              'Browser research request queued and pending verification.',
              `Open ${config.verificationUiUrl} to approve the request.`,
              'The system will handle the result asynchronously after approval.',
            ].join('\n'),
          },
        ],
        details: null,
      };
    },
  };
}
