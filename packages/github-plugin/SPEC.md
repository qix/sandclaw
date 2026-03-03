# GitHub Plugin

## Overview

The GitHub plugin handles human approval of pull requests created by the Confidante during its dev mode. When the Confidante creates a PR (e.g. after implementing a feature via Claude Code), it notifies the Gatekeeper, which creates a verification request. A human reviews the PR details in the Gatekeeper UI and, if satisfied, approves it. Approval triggers an auto-merge via the `gh` CLI.

## Packages

| Package              | Used By             | Purpose                                      |
| -------------------- | ------------------- | -------------------------------------------- |
| `gh` (GitHub CLI)    | Gatekeeper (system) | Merges PRs via `gh pr merge` subprocess call |
| `node:child_process` | Gatekeeper          | Spawns `gh` CLI for merge operation          |

The `gh` CLI must be installed and authenticated on the Gatekeeper host.

## Database Tables

Uses only the core `verification_requests` table. No module-specific tables.

### `verification_requests` usage

| Field    | Value                                   |
| -------- | --------------------------------------- |
| `module` | `"github"`                              |
| `action` | `"pr_created"`                          |
| `data`   | JSON-encoded `GithubPrVerificationData` |

```typescript
interface GithubPrVerificationData {
  prompt: string; // The prompt/task that was developed
  prUrl: string; // Full GitHub PR URL
  prNumber: number; // PR number (positive integer)
  branch: string; // Branch name
  title: string; // PR title
}
```

## UI Component (`GithubPrVerification`)

Displayed in the Verification tab for `module="github"` records.

**Shows:**

- "GitHub PR" badge
- PR number as a clickable link
- Creation timestamp
- PR Title (pre-formatted block)
- Branch name (pre-formatted block)
- Prompt / task description (pre-formatted block, max-height scrollable)
- PR URL as a clickable link
- Approve / Reject action buttons (via shared `VerificationActions` component)

## Notes

- There is no "result" fed back to the muteworker after a GitHub approval. GitHub PR merging is a terminal action.
- The `--auto` flag on `gh pr merge` means GitHub will merge automatically once required status checks pass, rather than immediately.
- The `gh` CLI must be pre-authenticated on the Gatekeeper host (e.g. via `gh auth login`).
- There is no rejection callback for the Confidante. If a PR is rejected in the Gatekeeper, the PR simply remains open on GitHub.
