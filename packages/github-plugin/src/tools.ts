import type { MuteworkerPluginContext } from '@sandclaw/muteworker-plugin-api';

export function createPullRequestTool(ctx: MuteworkerPluginContext) {
  return {
    name: 'create_pull_request',
    label: 'Create Pull Request',
    description:
      'Create a GitHub pull request and submit it for human verification. The PR will be auto-merged (rebase) once approved.',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'GitHub repo in owner/name format' },
        head: { type: 'string', description: 'Source branch/ref to create the PR from' },
        title: { type: 'string', description: 'PR title (defaults to branch name)' },
        body: { type: 'string', description: 'PR description' },
      },
      required: ['repo', 'head'],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { repo, head, title, body } = params;

      const response = await fetch(`${ctx.apiBaseUrl}/api/github/create-pr`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repo, head, title, body }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`GitHub create-pr failed (${response.status}): ${text.slice(0, 200)}`);
      }

      const result = (await response.json()) as {
        verificationRequestId?: number;
        prUrl?: string;
        prNumber?: number;
        status?: string;
      };

      ctx.artifacts.push({ type: 'text', label: 'PR URL', value: result.prUrl || '' });

      const replyText = [
        `Pull request #${result.prNumber} created and pending human verification.`,
        `PR: ${result.prUrl}`,
        `Open ${ctx.verificationUiUrl} to approve request #${result.verificationRequestId}.`,
      ].join('\n');

      return {
        content: [{ type: 'text', text: replyText }],
        details: result,
      };
    },
  };
}
