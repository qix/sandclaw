# Obsidian Plugin

## Overview

The Obsidian module provides read and write access to an Obsidian vault on the Gatekeeper host's filesystem. Reading is a safe operation (no verification required). Writing requires human approval, which is shown with a line-by-line diff preview in the Gatekeeper UI.

## Configuration

```yaml
plugins:
  obsidian:
    vaultRoot: "~/obsidian"
```

The vault root is resolved once at startup and cached. `~` is expanded to the OS home directory. All file paths are validated to be within the vault root (path traversal is rejected).

## Database Tables

Uses only the core `verification_requests` table. No module-specific tables.

### `verification_requests` usage

| Field    | Value                                        |
| -------- | -------------------------------------------- |
| `module` | `"obsidian"`                                 |
| `action` | `"write_file"`                               |
| `data`   | JSON-encoded `ObsidianWriteVerificationData` |

## TypeScript Interfaces

```typescript
interface ObsidianSearchRequest {
  query: string;
  limit?: number; // 1–20, default 5
}

interface ObsidianSearchResult {
  path: string; // Vault-relative path
  title: string; // First H1 heading, or filename without extension
  score: number; // BM25 score (4 decimal places)
  excerpt: string; // ~320-char snippet around first match
  modifiedAt: string; // ISO 8601
}

interface ObsidianSearchResponse {
  query: string;
  indexedAt: string; // ISO 8601; when the vault was last scanned
  totalMatches: number; // Total docs that matched (before limit)
  results: ObsidianSearchResult[];
}

interface ObsidianReadRequest {
  path: string;
  maxChars?: number; // 1–500,000; no default (returns full file)
}

interface ObsidianReadResponse {
  path: string; // Vault-relative path (normalised)
  content: string;
  truncated: boolean;
  bytes: number; // Full file size in bytes (before any truncation)
  modifiedAt: string; // ISO 8601
}

interface ObsidianWriteRequest {
  path: string;
  content: string;
}

interface ObsidianDiffLine {
  type: "context" | "add" | "remove";
  text: string;
}

interface ObsidianDiffPreview {
  lines: ObsidianDiffLine[];
  added: number;
  removed: number;
  unchanged: number;
  truncated: boolean; // True if diff exceeded MAX_DIFF_PREVIEW_LINES
  totalLines: number; // Total diff lines before truncation
}

interface ObsidianWriteVerificationData {
  path: string; // Vault-relative path
  mode: "overwrite";
  previousContent: string; // Current file content at verification creation time
  nextContent: string; // Resulting content after the write is applied
  previousBytes: number;
  nextBytes: number;
  diff: ObsidianDiffPreview;
  createdAt: string; // ISO 8601
}
```

## Search Implementation

The module maintains an in-memory `ObsidianVaultIndex` (singleton) that is built lazily and refreshed on writes.

### Indexing

- Scans all `.md`, `.markdown`, `.txt`, `.mdx` files recursively.
- Skips symbolic links and directories: `.git`, `.obsidian`, `.trash`, `node_modules`.
- Tokenisation: lowercased, Unicode NFKD normalised, non-alphanumeric characters stripped, split on whitespace, minimum token length 2.
- Per-document: term frequency map, token count, extracted title.

### Title Extraction

Looks for the first line starting with `# ` (H1 heading). Falls back to filename without extension.

### Freshness

The index is considered stale if it has never been built or if `Date.now() - lastScanMs >= INDEX_REFRESH_MIN_MS (2000ms)`. Multiple concurrent search calls while a scan is in flight share the same scan promise.

The index is force-staled (`markStale()`) after every approved write.

### BM25 Scoring

Standard BM25 with `k1 = 1.5`, `b = 0.75`. Parameters are not configurable.

### Excerpt Generation

Finds the first occurrence of any query term in the document text, extracts ~320 characters around it with `...` prefix/suffix. Falls back to the first 280 characters if no term is found.

## Diff Algorithm

- For files where `before.length × after.length ≤ 90,000` (matrix cells): full LCS (Longest Common Subsequence) diff.
- For larger files: `diffByPrefixSuffix()` — identifies common prefix and suffix, marks only the middle section as added/removed.

Diff output is capped at `MAX_DIFF_PREVIEW_LINES = 500` lines for the UI.

## Approval Safety

When `POST /api/obsidian/approve/[id]` is called, the module re-reads the current file content and compares it to `verification.previousContent`. If they differ (the file was modified after the verification was created), approval is rejected with an error. The muteworker must re-issue the write request.

## API Endpoints

### `POST /api/obsidian/search`

**Caller:** Muteworker (no auth required). Safe operation.

**Request body:**

```json
{ "query": "meeting notes Q1", "limit": 5 }
```

**Response 200:**

```json
{
  "query": "meeting notes Q1",
  "indexedAt": "2026-03-03T10:00:00.000Z",
  "totalMatches": 12,
  "results": [
    {
      "path": "notes/meetings/2026-01.md",
      "title": "January Meetings",
      "score": 3.1415,
      "excerpt": "...Q1 meeting notes for the team...",
      "modifiedAt": "2026-01-15T09:30:00.000Z"
    }
  ]
}
```

**Response 400:** Missing or invalid `query`.

### `POST /api/obsidian/read`

**Caller:** Muteworker (no auth required). Safe operation.

**Request body:**

```json
{ "path": "notes/meetings/2026-01.md", "maxChars": 10000 }
```

**Response 200:**

```json
{
  "path": "notes/meetings/2026-01.md",
  "content": "# January Meetings\n\n...",
  "truncated": false,
  "bytes": 4200,
  "modifiedAt": "2026-01-15T09:30:00.000Z"
}
```

**Response 400:** Missing `path` or path escapes vault.
**Response 404:** File not found.

### `POST /api/obsidian/write`

**Caller:** Muteworker (no auth required). Creates a verification request.

**Request body:**

```json
{
  "path": "notes/meetings/2026-01.md",
  "content": "# January Meetings\n\nUpdated content..."
}
```

**What it does:**

1. Reads the current file content (or `""` if new file).
2. Computes `nextContent` (overwrites existing content).
3. Generates a line-by-line diff preview.
4. Creates a `verification_request` with all of the above.

**Response 202:**

```json
{
  "verificationRequestId": 14,
  "path": "notes/meetings/2026-01.md",
  "mode": "overwrite",
  "diff": {
    "added": 2,
    "removed": 1,
    "unchanged": 8,
    "truncated": false,
    "totalLines": 11
  }
}
```

**Response 400:** Missing `path` or `content`, or path escapes vault.

### `POST /api/obsidian/approve/[id]`

**Caller:** Human via Gatekeeper UI

Verifies the file hasn't changed since the verification was created, then writes the file.

**What it does:**

1. Looks up the verification request.
2. Parses `ObsidianWriteVerificationData` from `data`.
3. Re-reads the file and compares to `previousContent`.
4. If unchanged: creates parent directories, writes `nextContent` to the file.
5. Calls `vaultIndex.markStale()` to force a re-scan on the next search.
6. Updates `verification_requests.status` to `"approved"`.

**Response 200:**

```json
{
  "success": true,
  "path": "notes/meetings/2026-01.md",
  "bytes": 4312
}
```

**Response 404:** Verification not found or already resolved.
**Response 409:** File changed since verification was created. Muteworker must re-request.
**Response 500:** File system error.

## Muteworker Tools

Three tools created by `createObsidianTools()` in `apps/muteworker/src/tools/obsidian.ts`:

### Search Tool

- Name: `obsidian_search` (or similar)
- Calls `POST /api/obsidian/search`
- Returns ranked results with paths, titles, scores, and excerpts
- No verification required

### Read Tool

- Name: `obsidian_read`
- Calls `POST /api/obsidian/read`
- Returns file content, truncation flag, and metadata
- No verification required

### Write Tool

- Name: `obsidian_write`
- Calls `POST /api/obsidian/write`
- Returns `verificationRequestId` and diff summary
- Agent must inform the user that a human approval is pending

## Full Request Flow

### Read (no verification)

```
Muteworker tool → POST /api/obsidian/read { path }
Gatekeeper      → reads file from vault filesystem
               ← 200 { content, truncated, bytes, modifiedAt }
```

### Write (with verification)

```
Muteworker tool → POST /api/obsidian/write { path, content }
Gatekeeper      → reads current file, builds diff, creates verification_request
               ← 202 { verificationRequestId: 14, diff: {...} }

Human reviews diff in Gatekeeper UI
               → POST /api/obsidian/approve/14
Gatekeeper      → re-reads file, verifies unchanged, writes file
               ← 200 { success: true, path, bytes }
```
