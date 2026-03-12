import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const INDEX_REFRESH_MIN_MS = 2000;
const BM25_K1 = 1.5;
const BM25_B = 0.75;
const SUPPORTED_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".mdx"]);
const SKIP_DIRS = new Set([".git", ".obsidian", ".trash", "node_modules"]);

interface DocumentEntry {
  /** Vault-relative path. */
  path: string;
  /** Extracted title (first H1 heading or filename). */
  title: string;
  /** Full file content. */
  content: string;
  /** Term frequency map. */
  termFreqs: Map<string, number>;
  /** Total token count. */
  tokenCount: number;
  /** File modified time (ISO 8601). */
  modifiedAt: string;
}

export interface SearchResult {
  path: string;
  title: string;
  score: number;
  excerpt: string;
  modifiedAt: string;
}

export class ObsidianVaultIndex {
  private readonly vaultRoot: string;
  private documents = new Map<string, DocumentEntry>();
  private avgDocLength = 0;
  private lastScanMs = 0;
  private scanPromise: Promise<void> | null = null;

  constructor(vaultRoot: string) {
    this.vaultRoot = vaultRoot;
  }

  get indexedAt(): string {
    return this.lastScanMs > 0
      ? new Date(this.lastScanMs).toISOString()
      : new Date().toISOString();
  }

  markStale(): void {
    this.lastScanMs = 0;
  }

  /**
   * Find files matching a bare filename (no directory separators).
   * Returns all vault-relative paths that end with the given filename.
   */
  async findByFilename(filename: string): Promise<string[]> {
    await this.ensureFresh();
    const matches: string[] = [];
    const lower = filename.toLowerCase();
    for (const relPath of this.documents.keys()) {
      const base = relPath.split("/").pop()!;
      if (base.toLowerCase() === lower) {
        matches.push(relPath);
      }
    }
    return matches.sort();
  }

  async ensureFresh(): Promise<void> {
    if (
      Date.now() - this.lastScanMs >= INDEX_REFRESH_MIN_MS ||
      this.lastScanMs === 0
    ) {
      if (!this.scanPromise) {
        this.scanPromise = this.scan().finally(() => {
          this.scanPromise = null;
        });
      }
      await this.scanPromise;
    }
  }

  async search(
    query: string,
    limit: number,
  ): Promise<{ totalMatches: number; results: SearchResult[] }> {
    await this.ensureFresh();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return { totalMatches: 0, results: [] };

    const N = this.documents.size;
    const scored: Array<{ doc: DocumentEntry; score: number }> = [];

    for (const doc of this.documents.values()) {
      let score = 0;
      for (const term of queryTokens) {
        const tf = doc.termFreqs.get(term) ?? 0;
        if (tf === 0) continue;

        // Count documents containing this term
        let df = 0;
        for (const d of this.documents.values()) {
          if (d.termFreqs.has(term)) df++;
        }

        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        const tfNorm =
          (tf * (BM25_K1 + 1)) /
          (tf +
            BM25_K1 *
              (1 - BM25_B + BM25_B * (doc.tokenCount / this.avgDocLength)));
        score += idf * tfNorm;
      }

      if (score > 0) {
        scored.push({ doc, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    return {
      totalMatches: scored.length,
      results: scored.slice(0, limit).map(({ doc, score }) => ({
        path: doc.path,
        title: doc.title,
        score: parseFloat(score.toFixed(4)),
        excerpt: generateExcerpt(doc.content, queryTokens),
        modifiedAt: doc.modifiedAt,
      })),
    };
  }

  private async scan(): Promise<void> {
    const newDocs = new Map<string, DocumentEntry>();
    await this.walkDir(this.vaultRoot, "", newDocs);

    let totalTokens = 0;
    for (const doc of newDocs.values()) {
      totalTokens += doc.tokenCount;
    }

    this.documents = newDocs;
    this.avgDocLength = newDocs.size > 0 ? totalTokens / newDocs.size : 0;
    this.lastScanMs = Date.now();
  }

  private async walkDir(
    absDir: string,
    relDir: string,
    docs: Map<string, DocumentEntry>,
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await this.walkDir(
          path.join(absDir, entry.name),
          relDir ? `${relDir}/${entry.name}` : entry.name,
          docs,
        );
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const absPath = path.join(absDir, entry.name);

      try {
        const [content, fileStat] = await Promise.all([
          readFile(absPath, "utf8"),
          stat(absPath),
        ]);

        const tokens = tokenize(content);
        const termFreqs = new Map<string, number>();
        for (const token of tokens) {
          termFreqs.set(token, (termFreqs.get(token) ?? 0) + 1);
        }

        docs.set(relPath, {
          path: relPath,
          title: extractTitle(content, entry.name),
          content,
          termFreqs,
          tokenCount: tokens.length,
          modifiedAt: fileStat.mtime.toISOString(),
        });
      } catch {
        // Skip unreadable files
      }
    }
  }
}

function tokenize(text: string): string[] {
  const normalized = text.normalize("NFKD").toLowerCase();
  const stripped = normalized.replace(/[^\p{L}\p{N}\s]/gu, "");
  return stripped.split(/\s+/).filter((t) => t.length >= 2);
}

function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  const ext = path.extname(filename);
  return ext ? filename.slice(0, -ext.length) : filename;
}

function generateExcerpt(content: string, queryTokens: string[]): string {
  const lowerContent = content.toLowerCase();
  let bestPos = -1;

  for (const term of queryTokens) {
    const pos = lowerContent.indexOf(term);
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
      bestPos = pos;
    }
  }

  if (bestPos === -1) {
    return content.slice(0, 280).trim() + (content.length > 280 ? "..." : "");
  }

  const start = Math.max(0, bestPos - 80);
  const end = Math.min(content.length, bestPos + 240);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";
  return `${prefix}${content.slice(start, end).trim()}${suffix}`;
}
