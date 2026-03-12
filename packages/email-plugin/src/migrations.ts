export async function migrations(knex: any): Promise<void> {
  if (!(await knex.schema.hasTable("email_received"))) {
    await knex.schema.createTable("email_received", (t: any) => {
      t.increments("id");
      t.text("message_id").notNullable().unique();
      t.text("from").notNullable();
      t.text("to").notNullable();
      t.text("subject");
      t.text("thread_id");
      t.integer("received_at");
      t.integer("created_at");
    });
  }
}
