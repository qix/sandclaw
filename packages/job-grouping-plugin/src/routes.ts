import path from "path";
import { writeFile, mkdir } from "node:fs/promises";
import { localTimestamp } from "@sandclaw/util";
import { generateRuleCode, buildRulesFileContent } from "./codeGenerator";

export function registerRoutes(
  app: any,
  db: any,
  config: { rulesDir: string; apiKey: string },
) {
  const rulesFilePath = path.join(config.rulesDir, "rules.js");

  /** Rebuild and write the rules file from all DB rules. */
  async function syncRulesFile() {
    const allRules = await db("job_grouping_rules").orderBy("id", "asc");
    const content = buildRulesFileContent(allRules);
    await mkdir(config.rulesDir, { recursive: true });
    await writeFile(rulesFilePath, content, "utf8");
  }

  // GET /rules — list all rules
  app.get("/rules", async (c: any) => {
    const rules = await db("job_grouping_rules").orderBy("id", "desc");
    return c.json({
      rules: rules.map((r: any) => ({
        id: r.id,
        prompt: r.prompt,
        generatedCode: r.generated_code,
        description: r.description,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  });

  // GET /rules/:id — get a single rule
  app.get("/rules/:id", async (c: any) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);
    const rule = await db("job_grouping_rules").where("id", id).first();
    if (!rule) return c.json({ error: "Rule not found" }, 404);
    return c.json({
      id: rule.id,
      prompt: rule.prompt,
      generatedCode: rule.generated_code,
      description: rule.description,
      createdAt: rule.created_at,
      updatedAt: rule.updated_at,
    });
  });

  // POST /rules — create a new rule (generates code from prompt)
  app.post("/rules", async (c: any) => {
    const body = await c.req.json();
    const prompt = (body.prompt ?? "").trim();
    if (!prompt) return c.json({ error: "prompt is required" }, 400);

    // Generate JavaScript code from the English prompt
    let generated;
    try {
      generated = await generateRuleCode(prompt, config.apiKey);
    } catch (e) {
      return c.json(
        { error: `Code generation failed: ${(e as Error).message}` },
        500,
      );
    }

    const now = localTimestamp();
    const [id] = await db("job_grouping_rules").insert({
      prompt,
      generated_code: generated.code,
      description: generated.description,
      created_at: now,
      updated_at: now,
    });

    // Sync the rules file
    await syncRulesFile();

    return c.json({
      id,
      prompt,
      generatedCode: generated.code,
      description: generated.description,
      createdAt: now,
    });
  });

  // PUT /rules/:id — update a rule's prompt (regenerates code)
  app.put("/rules/:id", async (c: any) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const existing = await db("job_grouping_rules").where("id", id).first();
    if (!existing) return c.json({ error: "Rule not found" }, 404);

    const body = await c.req.json();
    const prompt = (body.prompt ?? "").trim();
    if (!prompt) return c.json({ error: "prompt is required" }, 400);

    // Regenerate code
    let generated;
    try {
      generated = await generateRuleCode(prompt, config.apiKey);
    } catch (e) {
      return c.json(
        { error: `Code generation failed: ${(e as Error).message}` },
        500,
      );
    }

    const now = localTimestamp();
    await db("job_grouping_rules").where("id", id).update({
      prompt,
      generated_code: generated.code,
      description: generated.description,
      updated_at: now,
    });

    await syncRulesFile();

    return c.json({
      id,
      prompt,
      generatedCode: generated.code,
      description: generated.description,
      updatedAt: now,
    });
  });

  // PUT /rules/:id/code — manually edit generated code
  app.put("/rules/:id/code", async (c: any) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const existing = await db("job_grouping_rules").where("id", id).first();
    if (!existing) return c.json({ error: "Rule not found" }, 404);

    const body = await c.req.json();
    const code = (body.code ?? "").trim();
    if (!code) return c.json({ error: "code is required" }, 400);

    const now = localTimestamp();
    await db("job_grouping_rules").where("id", id).update({
      generated_code: code,
      updated_at: now,
    });

    await syncRulesFile();

    return c.json({ id, generatedCode: code, updatedAt: now });
  });

  // DELETE /rules/:id — delete a rule
  app.delete("/rules/:id", async (c: any) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const deleted = await db("job_grouping_rules").where("id", id).delete();
    if (deleted === 0) return c.json({ error: "Rule not found" }, 404);

    await syncRulesFile();

    return c.json({ success: true });
  });

  // GET /pending — list pending grouped jobs
  app.get("/pending", async (c: any) => {
    const pending = await db("job_grouping_pending")
      .select(
        "group_key",
        db.raw("count(*) as job_count"),
        "window_start",
        "job_type",
        "executor",
      )
      .groupBy("group_key", "window_start")
      .orderBy("window_start", "desc");

    return c.json({ groups: pending });
  });
}
