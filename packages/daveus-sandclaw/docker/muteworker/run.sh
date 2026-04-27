#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
IMAGE_NAME="sandclaw-muteworker"

# Build the image if needed
if [[ "${1:-}" == "build" ]] || ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
  echo "Building $IMAGE_NAME..."
  docker build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR"
  if [[ "${1:-}" == "build" ]]; then exit 0; fi
fi

# Ensure sandbox-net exists
docker network inspect sandbox-net &>/dev/null || \
  docker network create sandbox-net

exec docker run --rm -it \
  --name sandclaw-muteworker \
  --network=sandbox-net \
  --add-host=host.docker.internal:host-gateway \
  \
  -v "$WORKSPACE_DIR:/workspace:ro" \
  -v "$HOME/obsidian:/obsidian:ro" \
  \
  -e "GATEKEEPER_INTERNAL_URL=http://host.docker.internal:8888" \
  -e "GATEKEEPER_EXTERNAL_URL=${GATEKEEPER_EXTERNAL_URL:-}" \
  -e "OBSIDIAN_LOCAL_PATH=/obsidian" \
  \
  -e "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}" \
  -e "TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}" \
  -e "GMAIL_CLIENT_ID=${GMAIL_CLIENT_ID:-}" \
  -e "GMAIL_CLIENT_SECRET=${GMAIL_CLIENT_SECRET:-}" \
  -e "GMAIL_REFRESH_TOKEN=${GMAIL_REFRESH_TOKEN:-}" \
  -e "GMAIL_USER_EMAIL=${GMAIL_USER_EMAIL:-}" \
  -e "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}" \
  -e "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}" \
  -e "GOOGLE_REFRESH_TOKEN=${GOOGLE_REFRESH_TOKEN:-}" \
  -e "FASTMAIL_READ_API_TOKEN=${FASTMAIL_READ_API_TOKEN:-}" \
  -e "FASTMAIL_WRITE_API_TOKEN=${FASTMAIL_WRITE_API_TOKEN:-}" \
  -e "FASTMAIL_EMAIL=${FASTMAIL_EMAIL:-}" \
  -e "BUILDER_BRANCH=${BUILDER_BRANCH:-main}" \
  \
  -e "NODE_OPTIONS=--max-old-space-size=4096" \
  \
  "$IMAGE_NAME" "$@"
