// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Knex = any;

export async function runAgentStatusMigrations(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("agent_status")) return;
  await knex.schema.createTable("agent_status", (t: any) => {
    t.increments("id").primary();
    t.integer("job_id").notNullable().index();
    t.text("event").notNullable(); // 'started' | 'step' | 'completed' | 'failed'
    t.text("prompt").nullable();
    t.text("system_prompt").nullable();
    t.text("system_prompt_sources").nullable(); // JSON: { PromptFilename: Source }
    t.text("tool_names").nullable(); // JSON array
    t.text("data").nullable(); // JSON
    t.text("created_at").notNullable().index();
  });
}
