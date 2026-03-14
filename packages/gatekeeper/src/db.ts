import knex, { Knex } from "knex";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { localTimestamp } from "@sandclaw/util";
import { logger } from "./logger";

export function createDb(dbPath: string): Knex {
  mkdirSync(dirname(dbPath), { recursive: true });
  logger.info({ dbPath }, "Opening SQLite database");
  return knex({
    client: "better-sqlite3",
    connection: { filename: dbPath },
    useNullAsDefault: true,
  });
}

export async function runCoreMigrations(db: Knex): Promise<void> {
  if (!(await db.schema.hasTable("verification_requests"))) {
    await db.schema.createTable("verification_requests", (t) => {
      t.increments("id");
      t.text("plugin").notNullable();
      t.text("action").notNullable();
      t.text("data").notNullable();
      t.text("status").notNullable().defaultTo("pending");
      t.text("created_at");
      t.text("updated_at");
    });
  }

  // Add job_context column to verification_requests if missing, migrate from old job column
  if (await db.schema.hasTable("verification_requests")) {
    const cols = await db.raw("PRAGMA table_info(verification_requests)");
    const hasJob = cols.some((c: any) => c.name === "job");
    if (!hasJob) {
      await db.schema.alterTable("verification_requests", (t) => {
        t.text("job").nullable();
      });
    }
    const hasJobContext = cols.some((c: any) => c.name === "job_context");
    if (!hasJobContext) {
      await db.schema.alterTable("verification_requests", (t) => {
        t.text("job_context").nullable();
      });
      // Migrate existing "muteworker:123" / "confidante:123" values
      const rows = await db("verification_requests").whereNotNull("job");
      for (const row of rows) {
        const match = (row.job as string).match(
          /^(muteworker|confidante):(\d+)$/,
        );
        if (match) {
          await db("verification_requests")
            .where("id", row.id)
            .update({
              job_context: JSON.stringify({
                worker: match[1],
                jobId: parseInt(match[2], 10),
              }),
            });
        }
      }
    }
  }

  if (!(await db.schema.hasTable("job_queue"))) {
    await db.schema.createTable("job_queue", (t) => {
      t.increments("id");
      t.text("executor").notNullable();
      t.text("job_type").notNullable();
      t.text("data").notNullable();
      t.text("context");
      t.text("result");
      t.text("status").notNullable().defaultTo("pending");
      t.text("created_at");
      t.text("updated_at");
    });
  }

  // Migrate from old safe_queue / confidante_queue tables into job_queue
  if (await db.schema.hasTable("safe_queue")) {
    const rows = await db("safe_queue").select("*");
    for (const row of rows) {
      await db("job_queue").insert({
        executor: "muteworker",
        job_type: row.job_type,
        data: row.data,
        context: row.context ?? null,
        result: null,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }
    await db.schema.dropTable("safe_queue");
  }

  if (await db.schema.hasTable("confidante_queue")) {
    const rows = await db("confidante_queue").select("*");
    for (const row of rows) {
      await db("job_queue").insert({
        executor: "confidante",
        job_type: row.job_type,
        data: row.data,
        context: null,
        result: row.result ?? null,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }
    await db.schema.dropTable("confidante_queue");
  }

  if (!(await db.schema.hasTable("conversations"))) {
    await db.schema.createTable("conversations", (t) => {
      t.increments("id");
      t.text("plugin").notNullable();
      t.text("channel").notNullable();
      t.text("external_id").notNullable();
      t.text("created_at");
      t.unique(["plugin", "channel", "external_id"]);
    });
  }

  if (!(await db.schema.hasTable("conversation_message"))) {
    await db.schema.createTable("conversation_message", (t) => {
      t.increments("id");
      t.integer("conversation_id").notNullable();
      t.text("plugin").notNullable();
      t.text("channel").notNullable();
      t.text("message_id").notNullable();
      t.text("thread_id");
      t.text("from");
      t.text("to");
      t.text("timestamp").notNullable();
      t.text("direction").notNullable();
      t.text("text");
      t.text("created_at");
    });
  }

  if (!(await db.schema.hasTable("plugin_kv"))) {
    await db.schema.createTable("plugin_kv", (t) => {
      t.text("plugin").notNullable();
      t.text("key").notNullable();
      t.text("value");
      t.unique(["plugin", "key"]);
    });
  }

  // Migrate existing integer timestamps to ISO8601 strings (idempotent)
  await migrateIntegerTimestamps(db);
}

/** Convert integer epoch timestamps to ISO8601 strings across all core tables. */
async function migrateIntegerTimestamps(db: Knex): Promise<void> {
  const msColumns: Array<{ table: string; columns: string[] }> = [
    {
      table: "verification_requests",
      columns: ["created_at", "updated_at"],
    },
    { table: "job_queue", columns: ["created_at", "updated_at"] },
    { table: "conversations", columns: ["created_at"] },
    { table: "conversation_message", columns: ["created_at"] },
  ];

  // conversation_message.timestamp was stored as seconds
  const secColumns: Array<{ table: string; columns: string[] }> = [
    { table: "conversation_message", columns: ["timestamp"] },
  ];

  for (const { table, columns } of msColumns) {
    if (!(await db.schema.hasTable(table))) continue;
    const rows = await db(table).select(["id", ...columns]);
    for (const row of rows) {
      const updates: Record<string, string> = {};
      for (const col of columns) {
        const val = row[col];
        if (val != null && typeof val === "number") {
          updates[col] = localTimestamp(new Date(val));
        }
      }
      if (Object.keys(updates).length > 0) {
        await db(table).where("id", row.id).update(updates);
      }
    }
  }

  for (const { table, columns } of secColumns) {
    if (!(await db.schema.hasTable(table))) continue;
    const rows = await db(table).select(["id", ...columns]);
    for (const row of rows) {
      const updates: Record<string, string> = {};
      for (const col of columns) {
        const val = row[col];
        if (val != null && typeof val === "number") {
          updates[col] = localTimestamp(new Date(val * 1000));
        }
      }
      if (Object.keys(updates).length > 0) {
        await db(table).where("id", row.id).update(updates);
      }
    }
  }
}
