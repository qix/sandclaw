import { AgentTool } from '@mariozechner/pi-agent-core';
import { TSchema } from '@mariozechner/pi-ai';
import type { Artifact, ToolArgs } from './index';

export function createGoogleMapsTool(artifacts: Artifact[], args: ToolArgs): AgentTool {
  return {
    name: 'google_maps',
    label: 'Google Maps Link',
    description:
      'Generate a Google Maps search link for a location so it can be added to notes or messages.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' },
      },
      required: ['location'],
      additionalProperties: false,
    } as unknown as TSchema,
    execute: async (_toolCallId: string, params: any) => {
      const location = String(params.location ?? '').trim();
      if (!location) throw new Error('location is required');

      const url = new URL('https://www.google.com/maps/search/');
      url.searchParams.set('api', '1');
      url.searchParams.set('query', location);
      const mapsUrl = url.toString();

      args.logger.info('tool.google_maps.link', { jobId: args.job.id, location });
      artifacts.push({ type: 'text', label: 'Google Maps', value: location });

      return {
        content: [{ type: 'text', text: mapsUrl }],
        details: { location, url: mapsUrl },
      };
    },
  };
}
