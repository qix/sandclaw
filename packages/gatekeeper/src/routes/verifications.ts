import type { Hono } from "hono";
import type { Knex } from "knex";

export function registerVerificationFormRoutes(
  app: Hono,
  db: Knex,
  onVerificationChange?: () => void,
): void {
  // POST /verifications/approve/:id — forward to the plugin's approve endpoint, then redirect
  app.post("/verifications/approve/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.redirect("/?page=verifications");

    const request = await db("verification_requests").where("id", id).first();
    if (!request || request.status !== "pending") {
      return c.redirect("/?page=verifications");
    }

    // Try the plugin-specific approve endpoint (it may deliver the message, etc.)
    const pluginApproveUrl = `/api/${request.plugin}/approve/${id}`;
    const res = await app.request(pluginApproveUrl, { method: "POST" });

    // If the plugin doesn't have an approve endpoint, fall back to a direct DB update
    if (res.status === 404) {
      await db("verification_requests")
        .where("id", id)
        .update({ status: "approved", updated_at: Date.now() });
    }

    onVerificationChange?.();
    return c.redirect("/?page=verifications");
  });

  // POST /verifications/reject/:id — reject and redirect
  app.post("/verifications/reject/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.redirect("/?page=verifications");

    await db("verification_requests")
      .where("id", id)
      .where("status", "pending")
      .update({ status: "rejected", updated_at: Date.now() });

    onVerificationChange?.();
    return c.redirect("/?page=verifications");
  });
}
