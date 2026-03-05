export async function migrations(knex: any): Promise<void> {
  if (!(await knex.schema.hasTable("telegram_sessions"))) {
    await knex.schema.createTable("telegram_sessions", (t: any) => {
      t.increments("id");
      t.text("status").notNullable().defaultTo("disconnected");
      t.text("bot_username");
      t.text("bot_token");
      t.integer("last_heartbeat");
      t.integer("updated_at");
    });
  }
}
