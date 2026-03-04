import type { MuteworkerPluginContext, RunAgentFn } from '@sandclaw/muteworker-plugin-api';

export const builderJobHandlers = {
  async 'builder:response'(ctx: MuteworkerPluginContext, runAgent: RunAgentFn) {
    let payload: { requestId: string; result: string };
    try {
      payload = JSON.parse(ctx.job.data);
    } catch {
      throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
    }

    ctx.logger.info('builder.result.received', {
      jobId: ctx.job.id,
      requestId: payload.requestId,
    });

    ctx.artifacts.push({
      type: 'text',
      label: 'Build Result',
      value: payload.result.slice(0, 200),
    });

    const prompt = [
      '--- Build Result ---',
      `Request ID: ${payload.requestId}`,
      '',
      payload.result,
      '--------------------',
    ].join('\n');

    await runAgent(prompt);
  },
};
