FROM python:3.13-slim-bookworm

# 1. System dependencies (mirrors claudebox)
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    file \
    git \
    gnupg \
    htop \
    iproute2 \
    iptables \
    less \
    lsof \
    man-db \
    net-tools \
    nftables \
    dnsutils \
    jq \
    libxml2-utils \
    xmlstarlet \
    xml2 \
    procps \
    ripgrep \
    build-essential \
    tree \
    vim \
    strace \
    sudo \
    unzip \
    wget \
    xxd \
    ca-certificates

# 2. Node 25 via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_25.x | bash - \
    && apt-get install -y nodejs

# 3. Claude Code CLI + tsx
RUN npm install -g @anthropic-ai/claude-code tsx

# 4. Create 'dev' user, allow it to run the startup script with sudo
RUN useradd --home-dir /home/dev --create-home --user-group dev && \
    mkdir -p /home/dev/.claude /obsidian && \
    chown -R dev:dev /home/dev/ && \
    echo "dev ALL=(ALL) NOPASSWD: /usr/local/bin/setup-muteworker.sh" >> /etc/sudoers

# 5. mitmproxy proxy + trust config (cert is fetched at startup by setup-muteworker.sh)
ENV ALL_PROXY=http://host.docker.internal:8080
ENV HTTPS_PROXY=http://host.docker.internal:8080
ENV HTTP_PROXY=http://host.docker.internal:8080
ENV NO_PROXY=host.docker.internal,localhost,127.0.0.1
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/mitmproxy.crt
ENV SHELL=/bin/bash

COPY setup-muteworker.sh /usr/local/bin/setup-muteworker.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/setup-muteworker.sh /usr/local/bin/entrypoint.sh

USER dev

WORKDIR /workspace

# Obsidian vault is mounted at /obsidian (read-only)
# Workspace is mounted at /workspace (read-only)
# Network: sandbox-net only (egress via mitmproxy on host.docker.internal:8080)

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["tsx", "packages/daveus-sandclaw/muteworker.ts", "worker"]
