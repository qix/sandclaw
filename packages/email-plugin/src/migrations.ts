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
      t.integer("job_id");
      t.text("job_context");
    });
  }

  if (!(await knex.schema.hasTable("calendar_invite_seen"))) {
    await knex.schema.createTable("calendar_invite_seen", (t: any) => {
      t.increments("id");
      t.text("event_id").notNullable().unique();
      t.text("title");
      t.text("organizer_email");
      t.text("start_time");
      t.text("participation_status");
      t.integer("first_seen_at");
      t.integer("notified_at");
      t.integer("job_id");
    });
  }
}
