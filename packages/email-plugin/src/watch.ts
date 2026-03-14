import {
  queryUnseenEmails,
  getEmails,
  markAsRead,
  type EmailPluginConfig,
} from "./jmapClient";
import { queryCalendarInvites, formatDuration } from "./calendarClient";
import { localTimestamp } from "@sandclaw/util";
import { matchEmailQueue } from "./routes";

export async function isWatchInboxEnabled(db: any): Promise<boolean> {
  const row = await db("plugin_kv")
    .where({ plugin: "email", key: "watch_inbox" })
    .first();
  return row?.value === "true";
}

export async function isWatchCalendarEnabled(db: any): Promise<boolean> {
  const row = await db("plugin_kv")
    .where({ plugin: "email", key: "watch_calendar" })
    .first();
  return row?.value === "true";
}

export async function startEmailPolling(
  config: EmailPluginConfig,
  db: any,
  intervalMs: number,
): Promise<void> {
  if (!config.apiToken) return;

  const poll = async () => {
    try {
      const unseenIds = await queryUnseenEmails(config);
      if (unseenIds.length === 0) return;

      // Filter out emails already in email_received table
      const existing = await db("email_received")
        .whereIn("message_id", unseenIds)
        .select("message_id");
      const existingIds = new Set(existing.map((r: any) => r.message_id));
      const newIds = unseenIds.filter((id) => !existingIds.has(id));
      if (newIds.length === 0) return;

      const emails = await getEmails(config, newIds);

      for (const email of emails) {
        await db.transaction(async (trx: any) => {
          const now = localTimestamp();
          const receivedAt = localTimestamp(new Date(email.receivedAt));

          // Record in email_received to prevent future duplicates
          const [emailReceivedId] = await trx("email_received").insert({
            message_id: email.id,
            from: email.from,
            to: email.to,
            subject: email.subject,
            thread_id: email.threadId ?? null,
            received_at: receivedAt,
            created_at: now,
          });

          await trx("conversation_message").insert({
            conversation_id: 0,
            plugin: "email",
            channel: email.from,
            message_id: email.id,
            thread_id: email.threadId ?? null,
            from: email.from,
            to: email.to,
            timestamp: receivedAt,
            direction: "received",
            text: email.textBody,
            created_at: now,
          });

          // Only queue if watch inbox is enabled
          const watchEnabled = await isWatchInboxEnabled(trx);
          if (watchEnabled) {
            const history = await trx("conversation_message")
              .where("plugin", "email")
              .where("channel", email.from)
              .orderBy("timestamp", "asc")
              .limit(20);

            const historyEntries = history.map((h: any) => ({
              role:
                h.direction === "sent"
                  ? ("assistant" as const)
                  : ("user" as const),
              text: h.text ?? "",
              timestamp: h.timestamp,
            }));

            // Check if email matches a queue
            const emailQueuePrompt = config.emailQueueDir
              ? await matchEmailQueue(email.to, config.emailQueueDir)
              : null;

            const [jobId] = await trx("job_queue").insert({
              executor: "muteworker",
              job_type: "email:email_received",
              data: JSON.stringify({
                messageId: email.id,
                from: email.from,
                to: email.to,
                subject: email.subject,
                text: email.textBody,
                threadId: email.threadId ?? null,
                history: historyEntries,
                ...(emailQueuePrompt ? { emailQueuePrompt } : {}),
              }),
              context: JSON.stringify({ channel: "email", from: email.from }),
              status: "pending",
              created_at: now,
              updated_at: now,
            });

            // Link the job_queue job to the email_received record
            await trx("email_received")
              .where("id", emailReceivedId)
              .update({
                job_id: jobId,
                job_context: JSON.stringify({ worker: "muteworker", jobId }),
              });
          }
        });
      }

      // Mark all as read
      await markAsRead(config, newIds);
    } catch (err) {
      console.error("[email] Polling error:", err);
    }
  };

  setInterval(poll, intervalMs);
}

export async function startCalendarInvitePolling(
  config: EmailPluginConfig,
  db: any,
  intervalMs: number,
  options?: { systemPromptFile?: string },
): Promise<void> {
  if (!config.apiToken) return;

  const poll = async () => {
    try {
      const watchEnabled = await isWatchCalendarEnabled(db);
      if (!watchEnabled) return;

      const invites = await queryCalendarInvites(config);
      if (invites.length === 0) return;

      for (const invite of invites) {
        // Check if we've already seen this invite (by event_id)
        const existing = await db("calendar_invite_seen")
          .where("event_id", invite.id)
          .first();

        if (existing) continue;

        await db.transaction(async (trx: any) => {
          const now = localTimestamp();

          const organizer = invite.organizer
            ? invite.organizer.name
              ? `${invite.organizer.name} <${invite.organizer.email}>`
              : invite.organizer.email
            : "Unknown";

          const attendees = invite.participants
            .filter((p) => !p.roles.includes("owner"))
            .map(
              (p) =>
                `${p.name || p.email} (${p.participationStatus}${p.isSelf ? ", you" : ""})`,
            )
            .join(", ");

          // Record in calendar_invite_seen to prevent re-notification
          const [seenId] = await trx("calendar_invite_seen").insert({
            event_id: invite.id,
            title: invite.title,
            organizer_email: invite.organizer?.email ?? "",
            start_time: invite.start
              ? `${invite.start}${invite.timeZone ? ` (${invite.timeZone})` : ""}`
              : "",
            participation_status: "needs-action",
            first_seen_at: now,
            notified_at: now,
          });

          // Create a job for the muteworker to process this invite
          const [jobId] = await trx("job_queue").insert({
            executor: "muteworker",
            job_type: "email:calendar_invite_received",
            data: JSON.stringify({
              eventId: invite.id,
              title: invite.title,
              organizer,
              start: invite.start,
              timeZone: invite.timeZone,
              duration: invite.duration ? formatDuration(invite.duration) : "",
              location: invite.location,
              description: invite.description,
              participants: attendees,
              ...(options?.systemPromptFile
                ? { systemPromptFile: options.systemPromptFile }
                : {}),
            }),
            context: JSON.stringify({
              channel: "calendar",
              from: invite.organizer?.email ?? "unknown",
            }),
            status: "pending",
            created_at: now,
            updated_at: now,
          });

          // Link the job to the calendar_invite_seen record
          await trx("calendar_invite_seen")
            .where("id", seenId)
            .update({ job_id: jobId });
        });
      }
    } catch {
      // Polling error — will retry on next interval
    }
  };

  // Use a longer interval for calendar polling (default: 60s)
  setInterval(poll, Math.max(intervalMs, 60000));
}
