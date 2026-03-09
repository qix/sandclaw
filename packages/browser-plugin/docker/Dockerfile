FROM node:24

# Install Chromium and system dependencies for browser automation
RUN apt-get update && apt-get install -y --no-install-recommends \
  chromium \
  fonts-liberation \
  fonts-noto-color-emoji \
  fonts-noto-cjk \
  libnss3 \
  libgbm1 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdrm2 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libpango-1.0-0 \
  libasound2 \
  xvfb \
  procps \
  jq \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

ARG USERNAME=node

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

# Set up non-root user
USER node

# Set up global npm prefix
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Point Chromium at the system-installed binary
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install Claude Code CLI (required by agent SDK)
RUN npm install -g @anthropic-ai/claude-code

# Install agent-browser globally and run its install step
RUN npm install -g agent-browser && agent-browser install

# Copy container entry point source
COPY package.json tsconfig.json entry.ts ./

# Install dependencies and compile
RUN npm install && npx tsc

# Start Xvfb then run the entry point
CMD ["bash", "-c", "Xvfb :99 -screen 0 1280x720x24 -nolisten tcp &>/dev/null & export DISPLAY=:99 && node dist/entry.js"]
