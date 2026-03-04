import React from 'react';
import type { MuteworkerPluginContext, MuteworkerEnvironment } from '@sandclaw/muteworker-plugin-api';
import type { PluginEnvironment, VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BROWSER_VERIFICATION_ACTION = 'request_research';
const BROWSER_CONFIDANTE_JOB_TYPE = 'browser:research_request';
const DEFAULT_BROWSER_RESULT_JOB_TYPE = 'browser:research_result';

// ---------------------------------------------------------------------------
// Gatekeeper Plugin (UI + Routes)
// ---------------------------------------------------------------------------

function BrowserPanel() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Browser</h2>
      <p style={{ color: '#6b7280' }}>
        Allows the muteworker to request web research. All browser research
        requires human approval before the Confidante agent executes it.
        The approval and execution are deliberately decoupled: approving once
        lets the Confidante perform multiple searches to fulfil the request.
      </p>
      <section>
        <h3>Flow</h3>
        <ol style={{ lineHeight: '1.8' }}>
          <li>Muteworker requests research (creates verification request)</li>
          <li>Human reviews and approves in this UI</li>
          <li>Confidante executes browser automation</li>
          <li>Result posted back to muteworker as a safe queue job</li>
        </ol>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending research requests.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verification renderer
// ---------------------------------------------------------------------------

function BrowserVerificationRenderer({ data }: VerificationRendererProps) {
  const prompt = data?.prompt ?? '';
  const requestId = data?.requestId ?? '';
  const responseJobType = data?.responseJobType ?? '';
  const constraints = data?.constraints as { maxSteps?: number; timeoutMs?: number } | undefined;
  const createdAt = data?.createdAt ?? '';

  return (
    <div>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>
        <strong style={{ color: '#111827' }}>Research Prompt</strong>
      </div>
      <div
        style={{
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          fontSize: '0.95rem',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          marginBottom: '1rem',
        }}
      >
        {prompt}
      </div>
      <table style={{ fontSize: '0.82rem', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: '#6b7280', fontWeight: 600 }}>Request ID</td>
            <td style={{ padding: '0.2rem 0', fontFamily: 'monospace', fontSize: '0.8rem' }}>{requestId}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: '#6b7280', fontWeight: 600 }}>Response Job Type</td>
            <td style={{ padding: '0.2rem 0', fontFamily: 'monospace', fontSize: '0.8rem' }}>{responseJobType}</td>
          </tr>
          {constraints && (constraints.maxSteps != null || constraints.timeoutMs != null) && (
            <tr>
              <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: '#6b7280', fontWeight: 600 }}>Constraints</td>
              <td style={{ padding: '0.2rem 0', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {constraints.maxSteps != null && <>max {constraints.maxSteps} steps</>}
                {constraints.maxSteps != null && constraints.timeoutMs != null && <>, </>}
                {constraints.timeoutMs != null && <>{(constraints.timeoutMs / 1000).toFixed(0)}s timeout</>}
              </td>
            </tr>
          )}
          {createdAt && (
            <tr>
              <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: '#6b7280', fontWeight: 600 }}>Created</td>
              <td style={{ padding: '0.2rem 0', fontSize: '0.8rem' }}>{createdAt}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function createBrowserPlugin() {
  return {
    id: 'browser' as const,
    title: 'Browser',
    component: BrowserPanel,
    verificationRenderer: BrowserVerificationRenderer,

    registerGateway(_env: PluginEnvironment) {},
    registerMuteworker(_env: MuteworkerEnvironment) {},

    tools(ctx: MuteworkerPluginContext) {
      return [createRequestBrowserTool(ctx)];
    },

    jobHandlers: {
      async 'browser:research_result'(ctx: MuteworkerPluginContext, runAgent: RunAgentFn) {
        let payload: { requestId: string; result: string };
        try {
          payload = JSON.parse(ctx.job.data);
        } catch {
          throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
        }

        ctx.logger.info('browser.result.received', {
          jobId: ctx.job.id,
          requestId: payload.requestId,
        });

        ctx.artifacts.push({
          type: 'text',
          label: 'Browser Result',
          value: payload.result.slice(0, 200),
        });

        const prompt = [
          '--- Browser Research Result ---',
          `Request ID: ${payload.requestId}`,
          '',
          payload.result,
          '-------------------------------',
        ].join('\n');

        await runAgent(prompt);
      },
    },

    routes(app: any, db: any) {
      // POST /request — create a verification request for browser research
      app.post('/request', async (c) => {
        const body = await c.req.json() as {
          prompt?: string;
          responseJobType?: string;
          constraints?: { maxSteps?: number; timeoutMs?: number };
        };

        if (!body.prompt) return c.json({ error: 'prompt is required' }, 400);

        const requestId = randomUUID();
        const responseJobType = body.responseJobType || DEFAULT_BROWSER_RESULT_JOB_TYPE;
        const now = Date.now();

        const verificationData = {
          requestId,
          prompt: body.prompt,
          responseJobType,
          constraints: body.constraints ?? {},
          createdAt: new Date(now).toISOString(),
        };

        const [id] = await db('verification_requests').insert({
          plugin: 'browser',
          action: BROWSER_VERIFICATION_ACTION,
          data: JSON.stringify(verificationData),
          status: 'pending',
          created_at: now,
          updated_at: now,
        });

        return c.json({
          verificationRequestId: id,
          requestId,
          status: 'pending',
        });
      });

      // POST /approve/:id — approve and enqueue to confidante_queue
      app.post('/approve/:id', async (c) => {
        const id = parseInt(c.req.param('id'), 10);
        if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

        const request = await db('verification_requests').where('id', id).first();
        if (!request || request.status !== 'pending' || request.plugin !== 'browser') {
          return c.json({ error: 'Not found or already resolved' }, 404);
        }

        const verificationData = JSON.parse(request.data);
        const now = Date.now();

        // Enqueue to confidante_queue for execution
        await db('confidante_queue').insert({
          job_type: BROWSER_CONFIDANTE_JOB_TYPE,
          data: JSON.stringify({
            requestId: verificationData.requestId,
            prompt: verificationData.prompt,
            responseJobType: verificationData.responseJobType,
            constraints: verificationData.constraints,
          }),
          status: 'pending',
          created_at: now,
          updated_at: now,
        });

        await db('verification_requests')
          .where('id', id)
          .update({ status: 'approved', updated_at: now });

        return c.json({ success: true, requestId: verificationData.requestId });
      });

      // POST /result — confidante posts research results back
      // This enqueues a job in the safe_queue for the muteworker to consume
      app.post('/result', async (c) => {
        const body = await c.req.json() as {
          requestId: string;
          responseJobType?: string;
          result: string;
        };

        if (!body.requestId) return c.json({ error: 'requestId is required' }, 400);
        if (!body.result) return c.json({ error: 'result is required' }, 400);

        const jobType = body.responseJobType || DEFAULT_BROWSER_RESULT_JOB_TYPE;
        const now = Date.now();

        const [jobId] = await db('safe_queue').insert({
          job_type: jobType,
          data: JSON.stringify({
            requestId: body.requestId,
            result: body.result,
          }),
          status: 'pending',
          created_at: now,
          updated_at: now,
        });

        return c.json({ success: true, jobId });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Muteworker internals (Tool)
// ---------------------------------------------------------------------------

function createRequestBrowserTool(ctx: MuteworkerPluginContext) {
  return {
    name: 'request_browser',
    label: 'Request Browser Research',
    description:
      'Create a browser research request that must be human-approved before the Confidante agent executes it. Use this for web lookups, news, and online research.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const query = String(params.query ?? '').trim();
      if (!query) throw new Error('query is required');

      const response = await fetch(`${ctx.apiBaseUrl}/api/browser/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          responseJobType: DEFAULT_BROWSER_RESULT_JOB_TYPE,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Browser request failed (${response.status}): ${body.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        verificationRequestId: number;
        requestId: string;
        status: string;
      };

      ctx.artifacts.push({ type: 'text', label: 'Browser Request', value: query });

      return {
        content: [
          {
            type: 'text',
            text: [
              'Browser research request queued and pending verification.',
              `Open ${ctx.verificationUiUrl} to approve the request.`,
              'The system will handle the result asynchronously after approval.',
            ].join('\n'),
          },
        ],
        details: data,
      };
    },
  };
}

// Re-export for import convenience
import type { RunAgentFn } from '@sandclaw/muteworker-plugin-api';
