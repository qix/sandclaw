# Muteworker

## Overview

The muteworker is the "safe" TypeScript agent in SandClaw. It does all the bulk processing work — reading data, running LLM inference, making tool calls — but has no credentials and cannot directly reach the outside world. All real-world actions must go through the Gatekeeper's verification workflow and ultimately be executed by the Confidante.

The muteworker is designed to be safely exposed to untrusted data (e.g. incoming messages that may contain prompt injections) without risk, because it cannot act on anything without human approval.

## Tech Stack

| Package                       | Purpose                                |
| ----------------------------- | -------------------------------------- |
| `@mariozechner/pi-agent-core` | Agent execution framework (Pi runtime) |
| `@mariozechner/pi-ai`         | LLM model integrations                 |

## Queue Loop (`src/queueLoop.ts`)

`MuteworkerQueueLoop` polls the Gatekeeper for jobs using long polling, executes them, and marks them complete or failed.

**Algorithm:**

1. Call `GET /api/muteworker-queue/next` with the long-poll timeout.
2. If no job (204), loop immediately.
3. If job received, call `executeMuteworkerJob()`.
4. On success: call `POST /api/muteworker-queue/complete` with the job ID.
5. On any API error: apply exponential backoff (attempts × pollInterval, capped at 16× pollInterval), then retry.

## Job Executor (`src/jobExecutor.ts`)

`executeMuteworkerJob(job, config, logger)` dispatches to the appropriate handler by `jobType`. Each handler receives the parsed job data and returns a `MuteworkerJobResult`.

**Handled job types:**

| Job Type                    | Handler                     | Description                                               |
| --------------------------- | --------------------------- | --------------------------------------------------------- |
| `whatsapp:incoming_message` | Pi agent with full tool set | Process an incoming WhatsApp message and optionally reply |
| `browser:research_result`   | Pi agent                    | Receive and process completed browser research            |
| `github:*`                  | Pi agent                    | Handle GitHub-related results                             |
| _(default)_                 | Pi agent with full tool set | Generic prompt execution                                  |

The Pi agent is given the job's `data` as the user prompt (plus any `context`). The agent is constrained by `maxSteps` and `jobTimeoutMs`.

## Agent Tools (`src/tools/`)

Tools are created per-job and passed to the Pi agent. All tools are wrapped with `withToolCallLogging()` which logs timing and errors.

### WhatsApp Tool (`whatsapp.ts`)

`createSendWhatsappTool()` — Request sending a WhatsApp message.

- Validates recipient JID and message text.
- Calls `POST /api/whatsapp/send` via the API client.
- Returns the verification request ID and a URL to the verification UI, or "auto-approved" if the JID was on the auto-approve list.

### Browser Tool (`browser.ts`)

`createRequestBrowserTool()` — Request browser research.

- Accepts a natural language research prompt and optional context.
- Calls `POST /api/browser/request` via the API client.
- Returns the `verificationRequestId` and `requestId`. The result arrives as a separate `browser:research_result` safe queue job later.

### Obsidian Tools (`obsidian.ts`)

`createObsidianTools()` — Returns all three Obsidian tools:

- `createObsidianSearchTool()` — Full-text BM25 search across the vault. Calls `POST /api/obsidian/search`. No verification required.
- `createObsidianReadTool()` — Read a specific note by path. Calls `POST /api/obsidian/read`. No verification required.
- `createObsidianWriteTool()` — Request writing/updating a note. Calls `POST /api/obsidian/write`. Creates a verification request; the agent is given the verification ID and must wait.

### Web Search Tool (`web_search.ts`)

Direct Brave Search API integration. Uses `BRAVE_API_KEY` from config. Returns web search results without going through the Gatekeeper.

### Google Maps Tool (`google_maps.ts`)

Location lookup helper. Adds Google Maps links to location-related responses.

### Memory Tools (`memory.ts`)

Save and recall agent memory across jobs.

### Prompt Tools (`prompts.ts`)

Read and update the agent's own prompt files (`IDENTITY.md`, `SOUL.md`, etc.).

## Prompts (`prompts/`)

Markdown files that define the agent's behaviour, loaded by the Pi runtime at job start.

| File           | Purpose                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| `SYSTEM.md`    | Core behaviours: explains verification flow, instructs to include Google Maps links, etc. |
| `IDENTITY.md`  | Agent name and persona ("Daveza", robot emoji)                                            |
| `SOUL.md`      | Guiding philosophy: be direct, resourceful, respect privacy, dry humour                   |
| `HEARTBEAT.md` | Instructions for periodic heartbeat jobs                                                  |
| `USER.md`      | User-specific instructions and preferences                                                |

The agent can update these files using the Prompt tools; updated versions are submitted back to the Gatekeeper.

## Types (`src/types.ts`)

```typescript
interface MuteworkerQueueJob {
  id: number;
  jobType: string;
  data: string; // JSON string; parse before use
  context?: string; // JSON string
  status: "pending" | "in_progress" | "complete" | "failed";
}

interface IncomingWhatsappPayload {
  messageId: string;
  jid: string; // WhatsApp JID (e.g. "1234567890@s.whatsapp.net")
  text: string;
  history: Array<{
    direction: "sent" | "received";
    text: string;
    timestamp: number;
  }>;
}

interface MuteworkerJobResult {
  jobId: number;
  status: "success" | "failed";
  summary: string;
  artifacts?: unknown[];
  logs?: unknown;
  error?: unknown;
}
```

## Directory Structure

```
apps/muteworker/
├── src/
│   ├── main.ts            # Entry point
│   ├── queueLoop.ts       # Main polling loop
│   ├── jobExecutor.ts     # Job dispatch and execution
│   ├── apiClient.ts       # HTTP client for Gatekeeper
│   ├── tools/
│   │   ├── index.ts       # Assembles tool list
│   │   ├── browser.ts
│   │   ├── whatsapp.ts
│   │   ├── obsidian.ts
│   │   ├── web_search.ts
│   │   ├── google_maps.ts
│   │   ├── memory.ts
│   │   └── prompts.ts
│   ├── config.ts          # Config loading
│   ├── types.ts           # Shared type definitions
│   └── logger.ts          # Logging utilities
├── prompts/
│   ├── SYSTEM.md
│   ├── IDENTITY.md
│   ├── SOUL.md
│   ├── HEARTBEAT.md
│   └── USER.md
└── package.json
```
