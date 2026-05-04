// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Knex = any;

export async function runHttpMigrations(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("http_allow_list"))) {
    await knex.schema.createTable("http_allow_list", (t: any) => {
      t.increments("id").primary();
      t.text("method").notNullable();
      t.text("domain").notNullable();
      t.text("created_at").notNullable();
      t.unique(["method", "domain"]);
    });
  }

  if (!(await knex.schema.hasTable("http_requests"))) {
    await knex.schema.createTable("http_requests", (t: any) => {
      t.increments("id").primary();
      t.integer("job_id").nullable().index();
      t.text("method").notNullable();
      t.text("url").notNullable();
      t.text("domain").notNullable().index();
      t.text("outcome").notNullable(); // 'allowed' | 'blocked' | 'error'
      t.integer("status_code").nullable();
      t.integer("response_bytes").nullable();
      t.text("error").nullable();
      t.text("created_at").notNullable().index();
    });
  }
}
