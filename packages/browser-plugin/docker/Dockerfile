FROM node:24

# Install system dependencies needed by Chromium/Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    libgtk-3-0 \
    libx11-xcb1 \
    fonts-liberation \
    xdg-utils \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files (maintained outside the image on the host)
COPY package.json package-lock.json ./

# Install npm dependencies
RUN npm ci

# Install Chromium via agent-browser (includes system deps)
RUN npx agent-browser install --with-deps

# ENTRYPOINT ["npx", "pi"]
