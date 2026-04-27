#!/bin/bash
# Container startup script — runs once per container start as root via sudo.
# Mirrors prev-source/claudebox/setup-claudebox.sh: fetches the mitmproxy CA
# cert from the host so HTTPS traffic through the proxy can be verified.

# 1. Fetch and trust the mitmproxy CA cert.
curl --silent --proxy http://host.docker.internal:8080 -k \
  http://mitm.it/cert/pem \
  -o /usr/local/share/ca-certificates/mitmproxy.crt
update-ca-certificates

# 2. Pre-configure Claude Code settings if not already present.
CLAUDE_JSON="/home/dev/.claude/.claude.json"
if [ ! -f "$CLAUDE_JSON" ]; then
  echo '{"projects":{"/workspace":{"allowedTools":[],"hasTrustDialogAccepted":true}},"hasCompletedOnboarding":true}' \
    | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))" \
    > "$CLAUDE_JSON"
  chown dev:dev "$CLAUDE_JSON"
fi

SETTINGS_JSON="/home/dev/.claude/settings.json"
if [ ! -f "$SETTINGS_JSON" ]; then
  echo '{"skipDangerousModePermissionPrompt":true}' \
    | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))" \
    > "$SETTINGS_JSON"
  chown dev:dev "$SETTINGS_JSON"
fi
