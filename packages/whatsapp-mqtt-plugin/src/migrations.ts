export async function migrations(knex: any): Promise<void> {
  if (!(await knex.schema.hasTable("whatsapp_mqtt_sessions"))) {
    await knex.schema.createTable("whatsapp_mqtt_sessions", (t: any) => {
      t.increments("id");
      t.text("status").notNullable().defaultTo("disconnected");
      t.text("mqtt_url");
      t.text("last_heartbeat");
      t.text("updated_at");
    });
  }
}
