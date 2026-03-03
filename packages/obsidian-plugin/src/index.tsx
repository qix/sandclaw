import React from 'react';
import { createGatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';
import {
  createMuteworkerPlugin,
  type MuteworkerPluginContext,
} from '@sandclaw/muteworker-plugin-api';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { ObsidianVaultIndex } from './vaultIndex';
import { computeDiff } from './diff';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ObsidianPluginConfig {
  /** Path to the Obsidian vault root. `~` is expanded to the home directory. */
  vaultRoot: string;
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

function resolveVaultRoot(vaultRoot: string): string {
  const expanded = vaultRoot.startsWith('~')
    ? path.join(homedir(), vaultRoot.slice(1))
    : vaultRoot;
  return path.resolve(expanded);
}

function resolveVaultPath(vaultRoot: string, relativePath: string): string | null {
  const normalized = relativePath.trim().replace(/\\/g, '/');
  if (!normalized || path.isAbsolute(normalized)) return null;
  const absolute = path.resolve(vaultRoot, normalized);
  const relative = path.relative(vaultRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolute;
}

async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Gatekeeper Plugin (UI + Routes)
// ---------------------------------------------------------------------------

function ObsidianPanel() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Obsidian</h2>
      <p style={{ color: '#6b7280' }}>
        Provides read and write access to an Obsidian vault on the host
        filesystem. Reading is safe (no verification needed). Writing requires
        human approval with a line-by-line diff preview.
      </p>
      <section>
        <h3>Capabilities</h3>
        <ul style={{ lineHeight: '1.8' }}>
          <li><strong>Search:</strong> Full-text BM25 search across vault files</li>
          <li><strong>Read:</strong> Read any note by path (no verification)</li>
          <li><strong>Write:</strong> Create or overwrite notes (requires approval with diff preview)</li>
        </ul>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending write requests.</p>
      </section>
    </div>
  );
}

export function createObsidianPlugin(config: ObsidianPluginConfig) {
  const vaultRoot = resolveVaultRoot(config.vaultRoot);
  const vaultIndex = new ObsidianVaultIndex(vaultRoot);

  return createGatekeeperPlugin({
    id: 'obsidian',
    title: 'Obsidian',
    component: ObsidianPanel,

    routes(app, db) {
      // POST /search — BM25 search across vault
      app.post('/search', async (c) => {
        const body = await c.req.json() as { query?: string; limit?: number };
        const query = (body.query ?? '').trim();
        if (!query) return c.json({ error: 'query is required' }, 400);
        const limit = Math.min(20, Math.max(1, body.limit ?? 5));

        const { totalMatches, results } = await vaultIndex.search(query, limit);

        return c.json({
          query,
          indexedAt: vaultIndex.indexedAt,
          totalMatches,
          results,
        });
      });

      // POST /read — read a file from the vault
      app.post('/read', async (c) => {
        const body = await c.req.json() as { path?: string; maxChars?: number };
        const notePath = (body.path ?? '').trim();
        if (!notePath) return c.json({ error: 'path is required' }, 400);

        const absPath = resolveVaultPath(vaultRoot, notePath);
        if (!absPath) return c.json({ error: 'path escapes vault' }, 400);

        let content: string;
        let fileStat;
        try {
          [content, fileStat] = await Promise.all([
            readFile(absPath, 'utf8'),
            stat(absPath),
          ]);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
            return c.json({ error: 'File not found' }, 404);
          }
          throw e;
        }

        const bytes = Buffer.byteLength(content, 'utf8');
        let truncated = false;
        if (body.maxChars && body.maxChars > 0 && content.length > body.maxChars) {
          content = content.slice(0, body.maxChars);
          truncated = true;
        }

        // Normalize the relative path
        const relPath = path.relative(vaultRoot, absPath).replace(/\\/g, '/');

        return c.json({
          path: relPath,
          content,
          truncated,
          bytes,
          modifiedAt: fileStat.mtime.toISOString(),
        });
      });

      // POST /write — create a verification request for a vault write
      app.post('/write', async (c) => {
        const body = await c.req.json() as { path?: string; content?: string; append?: boolean };
        const notePath = (body.path ?? '').trim();
        if (!notePath) return c.json({ error: 'path is required' }, 400);
        if (typeof body.content !== 'string') return c.json({ error: 'content is required' }, 400);

        const absPath = resolveVaultPath(vaultRoot, notePath);
        if (!absPath) return c.json({ error: 'path escapes vault' }, 400);

        const relPath = path.relative(vaultRoot, absPath).replace(/\\/g, '/');
        const append = body.append === true;
        const previousContent = (await tryReadFile(absPath)) ?? '';
        const nextContent = append ? previousContent + body.content : body.content;
        const mode = append ? 'append' : 'overwrite';
        const diff = computeDiff(previousContent, nextContent);
        const now = Date.now();

        const verificationData = {
          path: relPath,
          mode,
          previousContent,
          nextContent,
          previousBytes: Buffer.byteLength(previousContent, 'utf8'),
          nextBytes: Buffer.byteLength(nextContent, 'utf8'),
          diff,
          createdAt: new Date(now).toISOString(),
        };

        const [id] = await db('verification_requests').insert({
          plugin: 'obsidian',
          action: 'write_file',
          data: JSON.stringify(verificationData),
          status: 'pending',
          created_at: now,
          updated_at: now,
        });

        return c.json(
          {
            verificationRequestId: id,
            path: relPath,
            mode,
            status: 'pending',
            diff: {
              added: diff.added,
              removed: diff.removed,
              unchanged: diff.unchanged,
              truncated: diff.truncated,
              totalLines: diff.totalLines,
            },
          },
          202,
        );
      });

      // POST /approve/:id — approve and execute a vault write
      app.post('/approve/:id', async (c) => {
        const id = parseInt(c.req.param('id'), 10);
        if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

        const request = await db('verification_requests').where('id', id).first();
        if (!request || request.status !== 'pending' || request.plugin !== 'obsidian') {
          return c.json({ error: 'Not found or already resolved' }, 404);
        }

        const verificationData = JSON.parse(request.data);
        const absPath = resolveVaultPath(vaultRoot, verificationData.path);
        if (!absPath) return c.json({ error: 'Invalid path in verification data' }, 500);

        // Re-read the file and verify it hasn't changed
        const currentContent = (await tryReadFile(absPath)) ?? '';
        if (currentContent !== verificationData.previousContent) {
          return c.json(
            { error: 'File changed since verification was created. Please re-request the write.' },
            409,
          );
        }

        // Write the file
        try {
          await mkdir(path.dirname(absPath), { recursive: true });
          await writeFile(absPath, verificationData.nextContent, 'utf8');
        } catch (e) {
          return c.json({ error: `File system error: ${(e as Error).message}` }, 500);
        }

        vaultIndex.markStale();

        await db('verification_requests')
          .where('id', id)
          .update({ status: 'approved', updated_at: Date.now() });

        return c.json({
          success: true,
          path: verificationData.path,
          bytes: Buffer.byteLength(verificationData.nextContent, 'utf8'),
        });
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Muteworker Plugin (Tools)
// ---------------------------------------------------------------------------

function createSearchTool(ctx: MuteworkerPluginContext) {
  return {
    name: 'obsidian_search',
    label: 'Search Obsidian Notes',
    description:
      'Search notes in the Obsidian vault using full-text BM25 search. Use this before reading specific files.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const query = String(params.query ?? '').trim();
      if (!query) throw new Error('query is required');
      const limit = params.limit != null ? Math.max(1, Math.min(20, Math.floor(Number(params.limit)))) : 5;

      const response = await fetch(`${ctx.apiBaseUrl}/api/obsidian/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, limit }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Obsidian search failed (${response.status}): ${body.slice(0, 200)}`);
      }

      const data = await response.json() as any;
      ctx.artifacts.push({ type: 'text', label: 'Obsidian Search', value: query });

      if (!data.results?.length) {
        return {
          content: [{ type: 'text', text: `No notes matched "${query}".` }],
          details: data,
        };
      }

      const rendered = data.results
        .map((r: any, i: number) => {
          const score = Number.isFinite(r.score) ? r.score.toFixed(3) : String(r.score);
          return [
            `${i + 1}. ${r.path} (score ${score})`,
            r.title ? `Title: ${r.title}` : '',
            r.excerpt?.trim() ? `Excerpt: ${r.excerpt.trim()}` : '',
          ]
            .filter(Boolean)
            .join('\n');
        })
        .join('\n\n');

      return { content: [{ type: 'text', text: rendered }], details: data };
    },
  };
}

function createReadTool(ctx: MuteworkerPluginContext) {
  return {
    name: 'obsidian_read',
    label: 'Read Obsidian Note',
    description: 'Read a specific note from the Obsidian vault by relative path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        maxChars: { type: 'number' },
      },
      required: ['path'],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const notePath = String(params.path ?? '').trim();
      if (!notePath) throw new Error('path is required');

      const payload: Record<string, unknown> = { path: notePath };
      if (params.maxChars != null) payload.maxChars = Math.floor(Number(params.maxChars));

      const response = await fetch(`${ctx.apiBaseUrl}/api/obsidian/read`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Obsidian read failed (${response.status}): ${body.slice(0, 200)}`);
      }

      const data = await response.json() as any;
      ctx.artifacts.push({ type: 'text', label: 'Obsidian Read', value: data.path });

      const suffix = data.truncated ? '\n\n[Output truncated by maxChars]' : '';
      return {
        content: [{ type: 'text', text: `${data.content}${suffix}` }],
        details: data,
      };
    },
  };
}

function createWriteTool(ctx: MuteworkerPluginContext) {
  return {
    name: 'obsidian_write',
    label: 'Write Obsidian Note',
    description:
      'Create a verification request to write text to an Obsidian note. A human must approve the diff before the file is changed.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        append: { type: 'boolean' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const notePath = String(params.path ?? '').trim();
      if (!notePath) throw new Error('path is required');
      if (typeof params.content !== 'string') throw new Error('content must be a string');

      const response = await fetch(`${ctx.apiBaseUrl}/api/obsidian/write`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: notePath,
          content: params.content,
          append: params.append === true,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Obsidian write failed (${response.status}): ${body.slice(0, 200)}`);
      }

      const data = await response.json() as any;
      ctx.artifacts.push({
        type: 'text',
        label: 'Obsidian Write Request',
        value: `${data.path} (${data.mode})`,
      });

      return {
        content: [
          {
            type: 'text',
            text: [
              `Queued Obsidian write verification #${data.verificationRequestId}.`,
              'No file has been changed yet.',
              `Path: ${data.path}`,
              `Mode: ${data.mode}`,
              `Diff: +${data.diff.added} -${data.diff.removed} =${data.diff.unchanged}`,
              `Open ${ctx.verificationUiUrl} to review and approve this change.`,
            ].join('\n'),
          },
        ],
        details: data,
      };
    },
  };
}

export const obsidianMuteworkerPlugin = createMuteworkerPlugin({
  id: 'obsidian',

  tools(ctx: MuteworkerPluginContext) {
    return [createSearchTool(ctx), createReadTool(ctx), createWriteTool(ctx)];
  },
});
