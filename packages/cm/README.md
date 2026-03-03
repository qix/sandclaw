# cm

A helper tool that spawns `claude` with a prompt and wraps the session in a git commit for traceability.

## How it works

1. **Clean-repo check** — refuses to run if the working tree has any uncommitted changes, preventing task context from being muddied by stale diffs.
2. **Prompt editor** — opens an inline multiline editor directly in your terminal. Previous terminal history is preserved above it. Press `ctrl+d` when you're done.
3. **Empty commit** — stamps the prompt into git history with `git commit --allow-empty -m "<prompt>"`, so you can always trace what you asked claude to do and when.
4. **claude handoff** — runs `devcontainer exec claude --dangerously-skip-permissions <prompt>` inside the container, streaming output straight to your terminal.

## Requirements

- A clean git working tree (no staged or unstaged changes)
- [`@devcontainers/cli`](https://github.com/devcontainers/cli) available as `devcontainer` on `PATH`
- Node 18.19+ (Node 24 recommended — matches the devcontainer image)

## Usage

```
cm
```

That's it. The prompt editor appears inline, expands as you type, and submits on `ctrl+d`. Cancel with `ctrl+c`.

### Development

```
npm run dev -w cm
```

Runs the TypeScript source directly via `tsx` — no build step needed.

## Design notes

`cm` is intentionally standalone. It lives inside the sandclaw monorepo at `packages/cm` but imports nothing from any other sandclaw package. It can be extracted and used independently at any time.
