import { AgentTool } from '@mariozechner/pi-agent-core';
import { TSchema } from '@mariozechner/pi-ai';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Artifact } from './index';

export function createMemoryTools(artifacts: Artifact[], memoryDir: string): AgentTool[] {
  return [
    {
      name: 'list_memory_files',
      label: 'List Memory Files',
      description:
        'List all files available under memory/. Use this before reading or writing memory files.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      } as unknown as TSchema,
      execute: async () => {
        const files = await listDir(memoryDir).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
          throw error;
        });
        return {
          content: [
            {
              type: 'text',
              text: files.length > 0 ? files.join('\n') : 'No memory files found in memory/.',
            },
          ],
          details: { files },
        };
      },
    },
    {
      name: 'read_memory_file',
      label: 'Read Memory File',
      description: 'Read a UTF-8 text file from memory/. Path must be relative to memory/.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
        additionalProperties: false,
      } as unknown as TSchema,
      execute: async (_toolCallId: string, params: any) => {
        const relativePath = validateRelativePath(String(params.path), memoryDir, 'memory/');
        const absolutePath = path.join(memoryDir, relativePath);
        const contents = await readFile(absolutePath, 'utf8');
        artifacts.push({ type: 'text', label: 'Memory Read', value: relativePath });
        return {
          content: [{ type: 'text', text: contents }],
          details: { path: relativePath, bytes: Buffer.byteLength(contents, 'utf8') },
        };
      },
    },
    {
      name: 'write_memory_file',
      label: 'Write Memory File',
      description: 'Write UTF-8 text to a file in memory/. Path must be relative to memory/.',
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
        const relativePath = validateRelativePath(String(params.path), memoryDir, 'memory/');
        const absolutePath = path.join(memoryDir, relativePath);
        const contents = String(params.content);
        const append = Boolean(params.append);

        await mkdir(path.dirname(absolutePath), { recursive: true });
        if (append) {
          const current = await readFile(absolutePath, 'utf8').catch((error) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
            throw error;
          });
          await writeFile(absolutePath, `${current}${contents}`, 'utf8');
        } else {
          await writeFile(absolutePath, contents, 'utf8');
        }

        artifacts.push({ type: 'text', label: 'Memory Write', value: relativePath });
        return {
          content: [
            {
              type: 'text',
              text: `Wrote ${Buffer.byteLength(contents, 'utf8')} bytes to memory/${relativePath}`,
            },
          ],
          details: { path: relativePath, append, bytes: Buffer.byteLength(contents, 'utf8') },
        };
      },
    },
  ];
}

function validateRelativePath(inputPath: string, rootDir: string, label: string): string {
  const normalized = inputPath.trim().replaceAll('\\', '/');
  if (!normalized) throw new Error(`${label} file path cannot be empty`);
  if (path.isAbsolute(normalized)) throw new Error(`${label} file path must be relative`);
  const absolute = path.resolve(rootDir, normalized);
  const relative = path.relative(rootDir, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes ${label} and is not allowed`);
  }
  return relative.replaceAll('\\', '/');
}

async function listDir(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const abs = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = await listDir(abs);
        return sub.map((f) => `${entry.name}/${f}`);
      }
      return entry.isFile() ? [entry.name] : [];
    }),
  );
  return files.flat().sort((a, b) => a.localeCompare(b));
}
