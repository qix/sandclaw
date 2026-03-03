# Gmail Plugin

## Overview

The Gmail module connects to the user's Gmail account via the Google Gmail API with OAuth2. It monitors for incoming emails and queues them as jobs for the muteworker, and it allows the muteworker to request sending emails (which require human approval before dispatch).

## Packages

| Package      | Used By    | Purpose                 |
| ------------ | ---------- | ----------------------- |
| `googleapis` | Gatekeeper | Google Gmail API client |

## Configuration

```yaml
plugins:
  gmail:
    clientId: "<google-oauth-client-id>"
    clientSecret: "<google-oauth-client-secret>"
    refreshToken: "<oauth-refresh-token>"
    userEmail: "<user@gmail.com>"
    pollIntervalMs: 30000 # Polling interval for new messages (ms); default 30000
```

## Database Tables

Uses the core `verification_requests` table and the shared `conversationMessage` table (defined in the WhatsApp module schema but shared across modules via `module` column).

### `verification_requests` usage

| Field    | Value                                    |
| -------- | ---------------------------------------- |
| `module` | `"gmail"`                                |
| `action` | `"send_email"`                           |
| `data`   | JSON-encoded `GmailSendVerificationData` |

```typescript
interface GmailSendVerificationData {
  to: string;
  subject: string;
  text: string;
}
```

### `conversation_message` usage

Incoming and sent emails are stored in the `conversation_message` table for conversation history.

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| `module`    | `"gmail"`                                        |
| `channel`   | Email thread ID or message ID                    |
| `direction` | `"received"` for incoming, `"sent"` for outgoing |
