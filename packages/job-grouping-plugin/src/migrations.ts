export async function migrations(knex: any): Promise<void> {
  if (!(await knex.schema.hasTable("job_grouping_rules"))) {
    await knex.schema.createTable("job_grouping_rules", (t: any) => {
      t.increments("id");
      t.text("prompt").notNullable();
      t.text("generated_code").notNullable();
      t.text("description");
      t.text("created_at");
      t.text("updated_at");
    });
  }

  if (!(await knex.schema.hasTable("job_grouping_pending"))) {
    await knex.schema.createTable("job_grouping_pending", (t: any) => {
      t.increments("id");
      t.integer("rule_id").notNullable();
      t.text("group_key").notNullable();
      t.text("executor").notNullable();
      t.text("job_type").notNullable();
      t.text("job_data").notNullable();
      t.text("job_context");
      t.text("window_start").notNullable();
      t.text("created_at").notNullable();
    });
  }
}
