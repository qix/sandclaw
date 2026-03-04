import { randomUUID } from 'node:crypto';
import { BROWSER_VERIFICATION_ACTION, BROWSER_CONFIDANTE_JOB_TYPE, DEFAULT_BROWSER_RESULT_JOB_TYPE } from './constants';

export function registerRoutes(app: any, db: any) {
  // POST /request — create a verification request for browser research
  app.post('/request', async (c: any) => {
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
  app.post('/approve/:id', async (c: any) => {
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
  app.post('/result', async (c: any) => {
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
}
