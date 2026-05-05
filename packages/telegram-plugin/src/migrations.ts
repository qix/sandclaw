export async function migrations(knex: any): Promise<void> {
  if (!(await knex.schema.hasTable("telegram_sessions"))) {
    await knex.schema.createTable("telegram_sessions", (t: any) => {
      t.increments("id");
      t.text("status").notNullable().defaultTo("disconnected");
      t.text("bot_username");
      t.text("bot_token");
      t.text("last_heartbeat");
      t.text("updated_at");
    });
  }

  if (!(await knex.schema.hasTable("telegram_attachments"))) {
    await knex.schema.createTable("telegram_attachments", (t: any) => {
      t.increments("id").primary();
      t.text("message_id").notNullable().index();
      t.text("chat_id").notNullable().index();
      t.text("kind").notNullable(); // 'photo' for now
      t.text("file_path").notNullable(); // absolute path on the gatekeeper FS
      t.text("file_unique_id"); // telegram dedup key
      t.text("mime_type");
      t.integer("file_size");
      t.text("caption");
      t.text("created_at").notNullable();
      t.unique(["chat_id", "file_unique_id"]);
    });
  }
}
