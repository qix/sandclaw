import knex, { Knex } from "knex";
import { logger } from "./logger";

export function createDb(connectionString: string): Knex {
  logger.info("Opening Postgres database");
  return knex({
    client: "pg",
    connection: connectionString,
    pool: { min: 0, max: 10 },
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
      t.text("error").nullable();
      t.text("job_context").nullable();
      t.text("created_at");
      t.text("updated_at");
    });
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
}
