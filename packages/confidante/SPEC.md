# Confidante

The Confidante is the "dangerous" TypeScript agent in SandClaw. It holds API credentials and has direct access to the outside world (browser, file system, external services). It only receives jobs that have been approved by a human in the Gatekeeper UI, ensuring it never processes untrusted data directly from the internet or from user messages.

The Confidante deliberately avoids doing complex reasoning over untrusted content. Its job is to execute a specific, human-approved action and return the result.

## Tech Stack

`@mariozechner/pi-agent-core`: Agent execution framework (Pi runtime)
`@mariozechner/pi-ai`: LLM model integrations
`agent-browser` / `pi-agent-browser`: Browser automation tools
`cac`: CLI argument parsing

**CLI flags:**

| Flag                      | Description                                        |
| ------------------------- | -------------------------------------------------- |
| `--prompt <text>`         | Single prompt to run (reads from stdin if omitted) |
| `--browser-profile <dir>` | Chrome profile directory for browser               |
| `-h, --help`              | Show help                                          |
