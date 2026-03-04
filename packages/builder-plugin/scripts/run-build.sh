#!/bin/bash
set -euo pipefail

# Defaults
BRANCH="main"
IMAGE="builder-plugin"
API_KEY="${ANTHROPIC_API_KEY:-}"
COMMIT_MESSAGE=""
REPO=""
PROMPT=""

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Run pi-coding-agent in a network-isolated Docker container against a cloned repo.

Required:
  --repo <url>            Git repo URL to clone
  --prompt <text>         Prompt to send to pi

Optional:
  --branch <branch>       Branch to checkout (default: main)
  --image <name>          Docker image name (default: builder-plugin)
  --api-key <key>         Anthropic API key (or set ANTHROPIC_API_KEY env)
  --commit-message <msg>  Commit message (default: prompt text)
  -h, --help              Show this help message
EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --repo)
            REPO="$2"
            shift 2
            ;;
        --branch)
            BRANCH="$2"
            shift 2
            ;;
        --prompt)
            PROMPT="$2"
            shift 2
            ;;
        --image)
            IMAGE="$2"
            shift 2
            ;;
        --api-key)
            API_KEY="$2"
            shift 2
            ;;
        --commit-message)
            COMMIT_MESSAGE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            ;;
    esac
done

# Validate required arguments
if [[ -z "$REPO" ]]; then
    echo "Error: --repo is required" >&2
    exit 1
fi

if [[ -z "$PROMPT" ]]; then
    echo "Error: --prompt is required" >&2
    exit 1
fi

if [[ -z "$API_KEY" ]]; then
    echo "Error: --api-key or ANTHROPIC_API_KEY env var is required" >&2
    exit 1
fi

# Default commit message to prompt text
if [[ -z "$COMMIT_MESSAGE" ]]; then
    COMMIT_MESSAGE="$PROMPT"
fi

# Clone repo into temp dir
TMPDIR=$(mktemp -d)
echo "Cloning $REPO (branch: $BRANCH) into $TMPDIR..."
git clone --branch "$BRANCH" "$REPO" "$TMPDIR/repo"

WORK_DIR="$TMPDIR/repo"

# Record HEAD hash
HEAD_BEFORE=$(git -C "$WORK_DIR" rev-parse HEAD)
echo "HEAD before: $HEAD_BEFORE"

# Run pi in Docker
echo "Running pi in Docker container ($IMAGE)..."
PI_EXIT_CODE=0
docker run --rm \
    --cap-add=NET_ADMIN \
    --cap-add=NET_RAW \
    -v "$WORK_DIR:/workspace" \
    -e "ANTHROPIC_API_KEY=$API_KEY" \
    "$IMAGE" \
    bash -c "sudo /usr/local/bin/init-firewall.sh && pi -p \"$PROMPT\"" \
    || PI_EXIT_CODE=$?

echo "pi exited with code: $PI_EXIT_CODE"

# Check for changes and commit if any
if [[ -n $(git -C "$WORK_DIR" status --porcelain) ]]; then
    echo "Changes detected, committing..."
    git -C "$WORK_DIR" add -A
    git -C "$WORK_DIR" commit -m "$COMMIT_MESSAGE"
    echo "Committed changes with message: $COMMIT_MESSAGE"
else
    echo "No changes detected."
fi

HEAD_AFTER=$(git -C "$WORK_DIR" rev-parse HEAD)
echo "HEAD after: $HEAD_AFTER"
echo "Repo path: $WORK_DIR"

exit "$PI_EXIT_CODE"
