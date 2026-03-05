export async function migrations(knex: any): Promise<void> {
  if (!(await knex.schema.hasTable("whatsapp_sessions"))) {
    await knex.schema.createTable("whatsapp_sessions", (t: any) => {
      t.increments("id");
      t.text("status").notNullable().defaultTo("disconnected");
      t.text("qr_data_url");
      t.text("phone_number");
      t.integer("last_heartbeat");
      t.integer("updated_at");
    });
  }

  if (!(await knex.schema.hasTable("whatsapp_auth_state"))) {
    await knex.schema.createTable("whatsapp_auth_state", (t: any) => {
      t.text("id").primary();
      t.text("data").notNullable();
    });
  }
}
