---
name: gws-shared
version: 1.0.0
description: "gws CLI: Shared patterns for authentication, global flags, and output formatting."
---

# gws — Shared Reference

## Global Flags

| Flag                    | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `--format <FORMAT>`     | Output format: `json` (default), `table`, `yaml`, `csv` |
| `--dry-run`             | Validate locally without calling the API                |
| `--sanitize <TEMPLATE>` | Screen responses through Model Armor                    |

## Tools

Use the `google_workspace_read` or `google_workspace_exec` tools to run gws commands.
Both take a `command` parameter which is an array of strings — the arguments you would pass after `gws` on the command line.

- **`google_workspace_read`** — Read-only operations (get, list, search, etc.). Runs immediately.
- **`google_workspace_exec`** — Write/mutating operations (create, update, delete, append, etc.). Requires human approval before executing.

### Syntax

```
command: ["<service>", "<resource>", "[sub-resource]", "<method>", ...flags]
```

### Method Flags

| Flag                        | Description                                   |
| --------------------------- | --------------------------------------------- |
| `--params '{"key": "val"}'` | URL/query parameters                          |
| `--json '{"key": "val"}'`   | Request body                                  |
| `-o, --output <PATH>`       | Save binary responses to file                 |
| `--upload <PATH>`           | Upload file content (multipart)               |
| `--page-all`                | Auto-paginate (NDJSON output)                 |
| `--page-limit <N>`          | Max pages when using --page-all (default: 10) |
| `--page-delay <MS>`         | Delay between pages in ms (default: 100)      |

## Security Rules

- **Never** output secrets (API keys, tokens) directly
- **Always** confirm with user before executing write/delete commands
- Prefer `--dry-run` for destructive operations
- Use `--sanitize` for PII/content safety screening
