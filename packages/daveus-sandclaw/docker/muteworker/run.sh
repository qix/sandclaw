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

###  named container?--name sandclaw-muteworker \

exec docker run --rm -it \
  --network=sandbox-net \
  --add-host=host.docker.internal:host-gateway \
  \
  -v "$WORKSPACE_DIR:/workspace:ro" \
  -v "$HOME/obsidian:/obsidian:ro" \
  \
  -e "GATEKEEPER_INTERNAL_URL=http://host.docker.internal:8888" \
  -e "OBSIDIAN_LOCAL_PATH=/obsidian" \
  -e "NODE_OPTIONS=--max-old-space-size=4096" \
  \
  "$IMAGE_NAME" "$@"
