# Gatekeeper App Spec

## Overview

The Gatekeeper is a web application that acts as the control center for the SandClaw safety framework. It sits between the safe side (muteworker) and the dangerous side (confidante), managing:

- A Postgres database for queues and verification requests
- REST API endpoints consumed by both muteworker and confidante
- A human-in-the-loop UI for reviewing and approving dangerous operations

## Tech Stack

| Package | Version | Purpose         |
| ------- | ------- | --------------- |
| `pg`    | ^8.x    | Postgres driver |

### Core Tables

#### `verification_requests`

Stores all pending and resolved cross-boundary action requests. Each module writes its own records here and implements its own approval endpoint.

| Column       | Type          | Notes                                                                   |
| ------------ | ------------- | ----------------------------------------------------------------------- |
| `id`         | INTEGER PK    | Auto-increment                                                          |
| `plugin`     | TEXT NOT NULL | Plugin name (e.g. `whatsapp`, `gmail`, `obsidian`, `browser`, `github`) |
| `action`     | TEXT NOT NULL | Action identifier within the plugin                                     |
| `data`       | TEXT NOT NULL | JSON blob; schema varies per plugin/action                              |
| `status`     | TEXT NOT NULL | Enum: `pending` \| `approved` \| `rejected`; default `pending`          |
| `created_at` | INTEGER       | Unix timestamp (milliseconds)                                           |
| `updated_at` | INTEGER       | Unix timestamp (milliseconds)                                           |

#### `safe_queue`

Jobs for the muteworker (safe) agent. Long-polled by the muteworker.

| Column       | Type          | Notes                                                                         |
| ------------ | ------------- | ----------------------------------------------------------------------------- |
| `id`         | INTEGER PK    | Auto-increment                                                                |
| `job_type`   | TEXT NOT NULL | Dotted string e.g. `whatsapp:incoming_message`                                |
| `data`       | TEXT NOT NULL | JSON blob; schema varies by job type                                          |
| `context`    | TEXT          | Optional JSON blob for caller context                                         |
| `status`     | TEXT NOT NULL | Enum: `pending` \| `in_progress` \| `complete` \| `failed`; default `pending` |
| `created_at` | INTEGER       | Unix timestamp                                                                |
| `updated_at` | INTEGER       | Unix timestamp                                                                |

#### `confidante_queue`

Jobs for the confidante (dangerous) agent. Long-polled by the confidante with Bearer auth.

| Column       | Type          | Notes                                                                         |
| ------------ | ------------- | ----------------------------------------------------------------------------- |
| `id`         | INTEGER PK    | Auto-increment                                                                |
| `job_type`   | TEXT NOT NULL | Dotted string e.g. `browser:research_request`                                 |
| `data`       | TEXT NOT NULL | JSON blob; schema varies by job type                                          |
| `result`     | TEXT          | Optional JSON blob; written by confidante on completion                       |
| `status`     | TEXT NOT NULL | Enum: `pending` \| `in_progress` \| `complete` \| `failed`; default `pending` |
| `created_at` | INTEGER       | Unix timestamp                                                                |
| `updated_at` | INTEGER       | Unix timestamp                                                                |

### `conversation_message`

Shared with the Gmail module. Stores all sent and received WhatsApp messages.

| Column            | Type             | Notes                                                    |
| ----------------- | ---------------- | -------------------------------------------------------- |
| `id`              | INTEGER PK       | Auto-increment                                           |
| `conversation_id` | INTEGER NOT NULL | Resolved conversation ID (see `resolveConversationId()`) |
| `plugin`          | TEXT NOT NULL    | Plugin name (example `"whatsapp"`)                       |
| `channel`         | TEXT NOT NULL    | Sender/recipient/channel identifier                      |
| `message_id`      | TEXT NOT NULL    | Unique per plugin message id                             |
| `thread_id`       | TEXT             | Optional thread/quoted message ID                        |
| `from`            | TEXT             | Sender unique id                                         |
| `to`              | TEXT             | Recipient unique id                                      |
| `timestamp`       | INTEGER NOT NULL | Unix timestamp (seconds)                                 |
| `direction`       | TEXT NOT NULL    | `"sent"` or `"received"`                                 |
| `text`            | TEXT             | Message body text                                        |
| `created_at`      | INTEGER          | Row insertion timestamp                                  |

Additional tables are defined by individual plugin (see plugin specs).

# REST API

### Safe Queue

#### `GET /api/muteworker-queue/next`

Long-poll for the next pending safe queue job. Returns immediately if a job is available, otherwise holds the connection open.

**Query params:**

- `timeout` (optional, integer seconds, clamped to 1–600, default 25) — how long to wait before returning a `204`

**Response 200:**

```json
{
  "id": 42,
  "jobType": "whatsapp:incoming_message",
  "data": "<json-string>",
  "context": "<json-string-or-null>",
  "status": "pending"
}
```

**Response 204:** No job available within the timeout.

#### `POST /api/muteworker-queue/complete`

Mark a safe queue job as complete.

**Body:**

```json
{ "id": 42 }
```

**Response 200:** `{ "success": true }`

#### `POST /api/muteworker-queue/add`

Add a new job to the safe queue.

**Body:**

```json
{
  "jobType": "browser:research_result",
  "data": "<json-string>",
  "context": "<json-string>"
}
```

**Response 200:** The created job record.

### Verifications

#### `POST /api/verifications/reject/[id]`

Reject any pending verification request. plugin with a callback (e.g. browser) will enqueue a "rejected" result in the safe queue.

**Response 200:** `{ "success": true }`
**Response 404:** Not found or already resolved.
