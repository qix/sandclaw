import {
  discoverSession,
  jmapCallRaw,
  type EmailPluginConfig,
} from "./jmapClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEventParticipant {
  participantId: string;
  name: string;
  email: string;
  participationStatus: string;
  roles: string[];
  isSelf: boolean;
}

export interface JmapCalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  timeZone: string;
  duration: string;
  location: string;
  status: string;
  organizer: { name: string; email: string } | null;
  participants: CalendarEventParticipant[];
  updated: string;
}

// ---------------------------------------------------------------------------
// JMAP Calendars capability
// ---------------------------------------------------------------------------

const JMAP_CALENDAR_USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:calendars",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractEmail(participant: any): string {
  // JSCalendar uses sendTo.imip for email, formatted as "mailto:..."
  if (participant.sendTo?.imip) {
    return participant.sendTo.imip.replace(/^mailto:/i, "");
  }
  if (participant.email) return participant.email;
  return "";
}

function parseParticipants(
  participantsMap: Record<string, any> | undefined,
  userEmail: string,
): CalendarEventParticipant[] {
  if (!participantsMap) return [];
  return Object.entries(participantsMap).map(([id, p]) => ({
    participantId: id,
    name: p.name || "",
    email: extractEmail(p),
    participationStatus: p.participationStatus || "needs-action",
    roles: Object.keys(p.roles || {}),
    isSelf: extractEmail(p).toLowerCase() === userEmail.toLowerCase(),
  }));
}

function extractLocation(
  locationsMap: Record<string, any> | undefined,
): string {
  if (!locationsMap) return "";
  return Object.values(locationsMap)
    .map((loc: any) => loc.name || loc.description || "")
    .filter(Boolean)
    .join(", ");
}

function formatDuration(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!m) return iso;
  const parts: string[] = [];
  if (m[1]) parts.push(`${m[1]}h`);
  if (m[2]) parts.push(`${m[2]}m`);
  if (m[3]) parts.push(`${m[3]}s`);
  return parts.join(" ") || iso;
}

// ---------------------------------------------------------------------------
// Raw fetching (shared between query-then-get flows)
// ---------------------------------------------------------------------------

async function getCalendarEventsRaw(
  config: EmailPluginConfig,
  apiUrl: string,
  calendarAccountId: string,
  ids: string[],
): Promise<JmapCalendarEvent[]> {
  if (ids.length === 0) return [];

  const result = await jmapCallRaw(
    apiUrl,
    config.apiToken,
    [
      [
        "CalendarEvent/get",
        {
          accountId: calendarAccountId,
          ids,
          properties: [
            "id",
            "title",
            "description",
            "start",
            "timeZone",
            "duration",
            "locations",
            "participants",
            "status",
            "replyTo",
            "updated",
            "created",
          ],
        },
        "g",
      ],
    ],
    JMAP_CALENDAR_USING,
  );

  const getResponse = result.methodResponses.find((r) => r[2] === "g");
  const list = (getResponse?.[1]?.list ?? []) as any[];

  return list.map((e) => {
    const participants = parseParticipants(e.participants, config.userEmail);
    const organizer =
      participants.find((p) => p.roles.includes("owner")) ?? null;

    return {
      id: e.id,
      title: e.title || "(No title)",
      description: e.description || "",
      start: e.start || "",
      timeZone: e.timeZone || "",
      duration: e.duration || "",
      location: extractLocation(e.locations),
      status: e.status || "confirmed",
      organizer: organizer
        ? { name: organizer.name, email: organizer.email }
        : null,
      participants,
      updated: e.updated || "",
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Query calendar events that need a response from the user.
 * Returns events where the user is a participant with status "needs-action".
 */
export async function queryCalendarInvites(
  config: EmailPluginConfig,
): Promise<JmapCalendarEvent[]> {
  const session = await discoverSession(config);
  if (!session.calendarAccountId) return [];

  // Query events from the past 7 days to 90 days in the future
  const now = new Date();
  const after = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const before = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const result = await jmapCallRaw(
    session.apiUrl,
    config.apiToken,
    [
      [
        "CalendarEvent/query",
        {
          accountId: session.calendarAccountId,
          filter: {
            after: after.toISOString(),
            before: before.toISOString(),
          },
          sort: [{ property: "start", isAscending: true }],
          limit: 200,
        },
        "q",
      ],
    ],
    JMAP_CALENDAR_USING,
  );

  const queryResponse = result.methodResponses.find((r) => r[2] === "q");
  const ids = (queryResponse?.[1]?.ids as string[]) ?? [];
  if (ids.length === 0) return [];

  // Fetch full event details
  const events = await getCalendarEventsRaw(
    config,
    session.apiUrl,
    session.calendarAccountId,
    ids,
  );

  // Filter for events where user's participation status is "needs-action"
  return events.filter((e) =>
    e.participants.some(
      (p) => p.isSelf && p.participationStatus === "needs-action",
    ),
  );
}

/** Fetch a single calendar event by ID. */
export async function getCalendarEvent(
  config: EmailPluginConfig,
  eventId: string,
): Promise<JmapCalendarEvent | null> {
  const session = await discoverSession(config);
  if (!session.calendarAccountId) return null;

  const events = await getCalendarEventsRaw(
    config,
    session.apiUrl,
    session.calendarAccountId,
    [eventId],
  );
  return events[0] ?? null;
}

/** Update the user's participation status for a calendar event. */
export async function respondToCalendarInvite(
  config: EmailPluginConfig,
  eventId: string,
  response: "accepted" | "declined" | "tentative",
): Promise<void> {
  const session = await discoverSession(config);
  if (!session.calendarAccountId) {
    throw new Error("Calendar not available for this JMAP account");
  }

  // Get the event to find the user's participant ID
  const event = await getCalendarEvent(config, eventId);
  if (!event) throw new Error("Calendar event not found");

  const selfParticipant = event.participants.find((p) => p.isSelf);
  if (!selfParticipant) {
    throw new Error("You are not a participant of this event");
  }

  const writeToken = config.writeApiToken || config.apiToken;

  const result = await jmapCallRaw(
    session.apiUrl,
    writeToken,
    [
      [
        "CalendarEvent/set",
        {
          accountId: session.calendarAccountId,
          update: {
            [eventId]: {
              [`participants/${selfParticipant.participantId}/participationStatus`]:
                response,
            },
          },
        },
        "u",
      ],
    ],
    JMAP_CALENDAR_USING,
  );

  // Check for errors
  const setResponse = result.methodResponses.find((r) => r[2] === "u");
  const notUpdated = setResponse?.[1]?.notUpdated;
  if (notUpdated?.[eventId]) {
    throw new Error(
      `Failed to update event: ${notUpdated[eventId]?.description ?? "unknown error"}`,
    );
  }
}

export { formatDuration };
