#!/usr/bin/env bash
#
# Run the builder-plugin entry.ts directly (no Docker).
# Installs deps, compiles, and runs the entry point with the cm-style
# transparent proxy for API call interception and prompt collection.
#
# Usage:
#   ./run-local.sh "Implement feature X"
#
# Required:
#   ANTHROPIC_API_KEY env var — API key for Claude
#
# Optional env vars:
#   CLAUDE_SAVE_LOGS   — path to save API request logs
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/docker"
ORIG_DIR="$(pwd)"

export CLAUDE_PROMPT="$1"

# This script might be triggered by claude and needs recursive access
unset CLAUDECODE
unset CLAUDE_CODE_ENTRYPOINT

# ── Install deps & compile ────────────────────────────────────────────
cd "$DOCKER_DIR"

if [ ! -d node_modules ]; then
  echo "[run-local] Installing dependencies..." >&2
  npm install --ignore-scripts
fi

echo "[run-local] Compiling entry.ts..." >&2
npx tsc

# ── Run ───────────────────────────────────────────────────────────────
# Run from the caller's directory so claude operates on their workspace
cd "$ORIG_DIR"
echo "[run-local] Starting builder agent" >&2
exec node "$DOCKER_DIR/dist/entry.js"
