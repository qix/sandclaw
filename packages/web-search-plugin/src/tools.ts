import { TSchema } from "@mariozechner/pi-ai";
import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_MAX_RESULTS_LIMIT = 10;

interface BraveSearchResponse {
  web?: {
    results?: Array<{
      title?: unknown;
      url?: unknown;
      description?: unknown;
      extra_snippets?: unknown;
    }>;
  };
}

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

export interface WebSearchConfig {
  braveApiKey: string;
  braveMaxResults?: number;
}

export function createBraveWebSearchTool(
  ctx: MuteworkerPluginContext,
  config: WebSearchConfig,
) {
  const maxResults = config.braveMaxResults ?? 5;

  return {
    name: "brave_web_search",
    label: "Brave Web Search",
    description:
      "Run an immediate web search using the Brave Search API and return top results with links and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        count: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    } as unknown as TSchema,
    execute: async (_toolCallId: string, params: any) => {
      const query = String(params.query ?? "").trim();
      if (!query) throw new Error("Search query cannot be empty");

      if (!config.braveApiKey) {
        return {
          content: [
            {
              type: "text",
              text: "Brave web search is unavailable because braveApiKey is not configured.",
            },
          ],
          details: { configured: false },
        };
      }

      const count = normalizeResultCount(params.count, maxResults);
      const results = await searchBraveWeb(query, count, config.braveApiKey);

      ctx.artifacts.push({ type: "text", label: "Brave Search", value: query });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No Brave web results found for "${query}".`,
            },
          ],
          details: { query, count: 0, results: [] },
        };
      }

      const rendered = results
        .map((result, index) =>
          [`${index + 1}. ${result.title}`, result.url, result.description]
            .filter((line) => line.length > 0)
            .join("\n"),
        )
        .join("\n\n");

      return {
        content: [{ type: "text", text: rendered }],
        details: { query, count: results.length, results },
      };
    },
  };
}

function normalizeResultCount(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") {
    return clamp(fallback, 1, BRAVE_MAX_RESULTS_LIMIT);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error("count must be a positive number");
  return clamp(Math.floor(parsed), 1, BRAVE_MAX_RESULTS_LIMIT);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function searchBraveWeb(
  query: string,
  count: number,
  apiKey: string,
): Promise<BraveSearchResult[]> {
  const url = new URL(BRAVE_SEARCH_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Brave search failed with status ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as BraveSearchResponse;
  const rawResults = payload.web?.results ?? [];

  return rawResults
    .map((result) => {
      const title = typeof result.title === "string" ? result.title.trim() : "";
      const resultUrl = typeof result.url === "string" ? result.url.trim() : "";
      let description =
        typeof result.description === "string" ? result.description.trim() : "";
      if (!description && Array.isArray(result.extra_snippets)) {
        const firstSnippet = result.extra_snippets.find(
          (s): s is string => typeof s === "string" && s.trim().length > 0,
        );
        description = firstSnippet?.trim() ?? "";
      }
      return { title, url: resultUrl, description };
    })
    .filter((r) => r.title.length > 0 && r.url.length > 0);
}
