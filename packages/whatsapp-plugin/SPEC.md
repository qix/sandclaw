# WhatsApp Plugin

## Overview

The WhatsApp module connects to WhatsApp via the Baileys library (multi-device protocol). It monitors for incoming messages and queues them as jobs for the muteworker, and it allows the muteworker to request sending messages. Outbound messages require human approval unless the recipient JID is on the auto-approve list.

The session and auth state are persisted in the SQLite database so the connection survives Gatekeeper restarts without needing to re-scan the QR code.

## Location

- **Module logic:** `apps/gatekeeper/src/modules/whatsapp/`
- **Schema:** `apps/gatekeeper/src/modules/whatsapp/schema.ts` (exported from main `src/db/schema.ts`)
- **API routes:** `apps/gatekeeper/src/pages/api/whatsapp/`
- **Muteworker tool:** `apps/muteworker/src/tools/whatsapp.ts`

## Packages

| Package                   | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `@whiskeysockets/baileys` | WhatsApp multi-device WebSocket client               |
| `qrcode`                  | QR code generation (DataURL) for pairing new devices |

## Configuration

No dedicated config section. The module reads its state from the database and operates automatically once authenticated.

## Database Tables

### `whatsapp_sessions`

Tracks the current connection state. Only one row is expected.

| Column           | Type          | Notes                                                                                       |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `id`             | INTEGER PK    | Auto-increment                                                                              |
| `status`         | TEXT NOT NULL | Enum: `disconnected` \| `qr_pending` \| `connecting` \| `connected`; default `disconnected` |
| `qr_data_url`    | TEXT          | Base64 DataURL of QR code PNG; only set while `status = "qr_pending"`                       |
| `phone_number`   | TEXT          | Authenticated phone number; set once connected                                              |
| `last_heartbeat` | INTEGER       | Timestamp of last successful Baileys event                                                  |
| `updated_at`     | INTEGER       | Timestamp of last status update                                                             |

### `whatsapp_auth_state`

Persists the Baileys multi-device auth state (keys, session data, etc.) so the session survives restarts.

| Column | Type          | Notes                                               |
| ------ | ------------- | --------------------------------------------------- |
| `id`   | TEXT PK       | Auth state key (e.g. `"creds"`, `"keys:pre-key-1"`) |
| `data` | TEXT NOT NULL | JSON-serialised auth state value                    |

## Muteworker queue messages

**Safe queue job data:**

```typescript
interface IncomingWhatsappPayload {
  messageId: string;
  jid: string;
  text: string;
  history: Array<{
    direction: "sent" | "received";
    text: string;
    timestamp: number;
  }>;
}
```

## Notes

- Baileys uses the WhatsApp multi-device WebSocket protocol. No phone must be online once paired.
- The QR code pairing flow: call `POST /api/whatsapp/connect`, then poll `GET /api/whatsapp/status` until `status = "qr_pending"`, display the `qrDataUrl` image, scan with WhatsApp on a phone. Status transitions to `connecting` then `connected`.
- Auth state contains cryptographic keys and session credentials. It is stored unencrypted in the SQLite database; database-level access control is the only protection.
