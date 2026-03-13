export interface EmailPluginConfig {
  /** JMAP host, e.g. "api.fastmail.com" */
  jmapHost: string;
  /** Fastmail API token (App Password with JMAP read scope) */
  apiToken: string;
  /** Fastmail API token with write/submission scope. Falls back to apiToken. */
  writeApiToken?: string;
  /** User's email address (the "from" for outbound) */
  userEmail: string;
  /** Polling interval for new messages in ms. Defaults to 30000. */
  pollIntervalMs?: number;
  /** Directory containing email queue markdown files. */
  emailQueueDir?: string;
  /** Path to a markdown file whose content is prepended to every email processing prompt. */
  systemPromptFile?: string;
}

export interface JmapEmail {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  receivedAt: string;
  textBody: string;
}

// ---------------------------------------------------------------------------
// Session cache
// ---------------------------------------------------------------------------

export interface JmapSession {
  apiUrl: string;
  accountId: string;
  inboxId: string;
  draftsId: string;
  calendarAccountId: string | null;
  fetchedAt: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
let cachedSession: JmapSession | null = null;

export function formatAddress(
  addrs: Array<{ name?: string; email: string }> | undefined,
): string {
  if (!addrs?.length) return "";
  return addrs
    .map((a) => (a.name ? `${a.name} <${a.email}>` : a.email))
    .join(", ");
}

// ---------------------------------------------------------------------------
// Low-level JMAP helpers
// ---------------------------------------------------------------------------

export async function discoverSession(
  config: EmailPluginConfig,
): Promise<JmapSession> {
  if (cachedSession && Date.now() - cachedSession.fetchedAt < SESSION_TTL_MS) {
    return cachedSession;
  }

  const url = `https://${config.jmapHost}/.well-known/jmap`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.apiToken}` },
  });
  if (!res.ok) {
    throw new Error(`JMAP session discovery failed: ${res.status}`);
  }

  const session = (await res.json()) as {
    apiUrl: string;
    primaryAccounts: Record<string, string>;
  };

  const accountId =
    session.primaryAccounts["urn:ietf:params:jmap:mail"] ??
    Object.values(session.primaryAccounts)[0];

  if (!accountId) throw new Error("No JMAP mail account found in session");

  // Check for calendar capability
  const calendarAccountId =
    session.primaryAccounts["urn:ietf:params:jmap:calendars"] ?? null;

  // Fetch mailbox IDs
  const mbRes = await jmapCallRaw(session.apiUrl, config.apiToken, [
    ["Mailbox/get", { accountId, properties: ["id", "name", "role"] }, "mb"],
  ]);

  const mailboxes =
    (mbRes.methodResponses?.[0]?.[1]?.list as Array<{
      id: string;
      role: string | null;
    }>) ?? [];

  const inbox = mailboxes.find((m) => m.role === "inbox");
  const drafts = mailboxes.find((m) => m.role === "drafts");

  if (!inbox) throw new Error("JMAP: no inbox mailbox found");

  cachedSession = {
    apiUrl: session.apiUrl,
    accountId,
    inboxId: inbox.id,
    draftsId: drafts?.id ?? inbox.id,
    calendarAccountId,
    fetchedAt: Date.now(),
  };

  return cachedSession;
}

function invalidateSession(): void {
  cachedSession = null;
}

const JMAP_USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
  // "urn:ietf:params:jmap:submission",
];

export async function jmapCallRaw(
  apiUrl: string,
  apiToken: string,
  methodCalls: Array<[string, Record<string, unknown>, string]>,
  using: string[] = JMAP_USING,
): Promise<{ methodResponses: Array<[string, any, string]> }> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ using, methodCalls }),
  });

  if (res.status === 401) {
    invalidateSession();
    throw new Error("JMAP: authentication failed (401)");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`JMAP call failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return (await res.json()) as {
    methodResponses: Array<[string, any, string]>;
  };
}

async function jmapCall(
  config: EmailPluginConfig,
  methodCalls: Array<[string, Record<string, unknown>, string]>,
): Promise<{ methodResponses: Array<[string, any, string]> }> {
  const session = await discoverSession(config);
  return jmapCallRaw(session.apiUrl, config.apiToken, methodCalls);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Query unseen email IDs from INBOX (up to 20). */
export async function queryUnseenEmails(
  config: EmailPluginConfig,
): Promise<string[]> {
  const session = await discoverSession(config);

  const result = await jmapCall(config, [
    [
      "Email/query",
      {
        accountId: session.accountId,
        filter: { inMailbox: session.inboxId, notKeyword: "$seen" },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit: 20,
      },
      "q",
    ],
  ]);

  const response = result.methodResponses.find((r) => r[2] === "q");
  return (response?.[1]?.ids as string[]) ?? [];
}

/** Fetch full email details by IDs. */
export async function getEmails(
  config: EmailPluginConfig,
  ids: string[],
): Promise<JmapEmail[]> {
  if (ids.length === 0) return [];

  const session = await discoverSession(config);

  const result = await jmapCall(config, [
    [
      "Email/get",
      {
        accountId: session.accountId,
        ids,
        properties: [
          "id",
          "threadId",
          "from",
          "to",
          "subject",
          "receivedAt",
          "textBody",
          "bodyValues",
        ],
        fetchTextBodyValues: true,
      },
      "g",
    ],
  ]);

  const response = result.methodResponses.find((r) => r[2] === "g");
  const list = (response?.[1]?.list ?? []) as Array<{
    id: string;
    threadId: string;
    from?: Array<{ name?: string; email: string }>;
    to?: Array<{ name?: string; email: string }>;
    subject?: string;
    receivedAt?: string;
    textBody?: Array<{ partId: string }>;
    bodyValues?: Record<string, { value: string }>;
  }>;

  return list.map((e) => {
    // Extract text from bodyValues using textBody part references
    let textBody = "";
    if (e.textBody?.length && e.bodyValues) {
      textBody = e.textBody
        .map((part) => e.bodyValues?.[part.partId]?.value ?? "")
        .join("\n");
    }

    return {
      id: e.id,
      threadId: e.threadId,
      from: formatAddress(e.from),
      to: formatAddress(e.to),
      subject: e.subject ?? "",
      receivedAt: e.receivedAt ?? "",
      textBody,
    };
  });
}

/** Query recent inbox email IDs (up to `limit`, default 25). */
export async function queryInboxEmails(
  config: EmailPluginConfig,
  limit = 25,
): Promise<JmapEmail[]> {
  const session = await discoverSession(config);

  const result = await jmapCall(config, [
    [
      "Email/query",
      {
        accountId: session.accountId,
        filter: { inMailbox: session.inboxId },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
      },
      "q",
    ],
  ]);

  const response = result.methodResponses.find((r) => r[2] === "q");
  const ids = (response?.[1]?.ids as string[]) ?? [];
  if (ids.length === 0) return [];

  return getEmails(config, ids);
}

/** Search emails by text query. Returns up to `limit` results (default 25). */
export async function searchEmails(
  config: EmailPluginConfig,
  query: string,
  limit = 25,
): Promise<JmapEmail[]> {
  const session = await discoverSession(config);

  const result = await jmapCall(config, [
    [
      "Email/query",
      {
        accountId: session.accountId,
        filter: { text: query },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
      },
      "q",
    ],
  ]);

  const response = result.methodResponses.find((r) => r[2] === "q");
  const ids = (response?.[1]?.ids as string[]) ?? [];
  if (ids.length === 0) return [];

  return getEmails(config, ids);
}

/** Send an email via JMAP (create draft + submit in one request). */
export async function sendEmail(
  config: EmailPluginConfig,
  to: string,
  subject: string,
  text: string,
): Promise<{ messageId: string }> {
  const session = await discoverSession(config);
  const writeToken = config.writeApiToken || config.apiToken;

  const result = await jmapCallRaw(
    session.apiUrl,
    writeToken,
    [
      [
        "Email/set",
        {
          accountId: session.accountId,
          create: {
            draft: {
              mailboxIds: { [session.draftsId]: true },
              from: [{ email: config.userEmail }],
              to: [{ email: to }],
              subject,
              textBody: [{ partId: "1", type: "text/plain" }],
              bodyValues: { "1": { value: text } },
            },
          },
        },
        "c",
      ],
      [
        "EmailSubmission/set",
        {
          accountId: session.accountId,
          create: {
            send: {
              emailId: "#draft",
              envelope: {
                mailFrom: { email: config.userEmail },
                rcptTo: [{ email: to }],
              },
            },
          },
          onSuccessDestroyEmail: ["#send"],
        },
        "s",
      ],
    ],
    [...JMAP_USING, "urn:ietf:params:jmap:submission"],
  );

  // Extract created email ID
  const createResponse = result.methodResponses.find((r) => r[2] === "c");
  const createdId = createResponse?.[1]?.created?.draft?.id ?? "";

  return { messageId: createdId };
}

/** Mark emails as seen ($seen keyword). */
export async function markAsRead(
  config: EmailPluginConfig,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;

  const session = await discoverSession(config);

  const update: Record<string, { "keywords/$seen": true }> = {};
  for (const id of ids) {
    update[id] = { "keywords/$seen": true };
  }

  await jmapCall(config, [
    ["Email/set", { accountId: session.accountId, update }, "r"],
  ]);
}
