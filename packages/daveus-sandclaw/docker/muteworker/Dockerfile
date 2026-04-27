FROM node:24-slim

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code tsx

# Create non-root user directories
RUN mkdir -p /home/node/.claude /obsidian && \
  chown -R node:node /home/node/.claude

USER node

WORKDIR /workspace

# Obsidian vault is mounted at /obsidian (read-only)
# Workspace is mounted at /workspace (read-only)
# Network: sandbox-net only (no direct internet)

CMD ["tsx", "packages/daveus-sandclaw/muteworker.ts", "worker"]
