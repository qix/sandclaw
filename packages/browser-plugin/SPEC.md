# Browser ModuPlugin

## Overview

The Browser module allows the muteworker to request web research. Because the browser is connected to the internet (dangerous) and may encounter prompt injections on public pages, all browser research requires human approval before execution. The Confidante executes the actual browsing using an LLM-powered client.

The approval and execution are deliberately decoupled: the human approves the research intent once, and the Confidante can then perform multiple searches and page reads to fulfil the request without further verification.

## Packages

| Package  | Used By    | Purpose                                 |
| -------- | ---------- | --------------------------------------- |
| `openai` | Gatekeeper | LLM-powered web search and page reading |

The OpenAI client is configured via `gatekeeper.browser.llmApiKey`, `llmModel` (default `gpt-4.1`), and `llmBaseUrl` (default `https://api.openai.com/v1`).

## Database Tables

The browser module uses only the core `verification_requests` and `confidante_queue` tables. No module-specific tables.

### `verification_requests` usage

| Field    | Value                                  |
| -------- | -------------------------------------- |
| `module` | `"browser"`                            |
| `action` | `"request_research"`                   |
| `data`   | JSON-encoded `BrowserVerificationData` |

### `confidante_queue` usage

| Field      | Value                            |
| ---------- | -------------------------------- |
| `job_type` | `"browser:research_request"`     |
| `data`     | JSON-encoded `ConfidanteJobData` |

### `safe_queue` usage (results)

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| `job_type` | `responseJobType` from the original request (default: `"browser:research_result"`) |
| `data`     | JSON-encoded `MuteworkerBrowserResultPayload`                                      |

## Key Constants

```typescript
BROWSER_VERIFICATION_ACTION = "request_research";
BROWSER_CONFIDANTE_JOB_TYPE = "browser:research_request";
DEFAULT_BROWSER_RESULT_JOB_TYPE = "browser:research_result";
```
