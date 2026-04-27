FROM node:24-slim

RUN apt update && apt-get install -y curl

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code tsx

# Create non-root user directories
RUN mkdir -p /home/node/.claude /obsidian && \
  chown -R node:node /home/node/.claude

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER node

WORKDIR /workspace

# Obsidian vault is mounted at /obsidian (read-only)
# Workspace is mounted at /workspace (read-only)
# Network: sandbox-net only (no direct internet)

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["tsx", "packages/daveus-sandclaw/muteworker.ts", "worker"]
