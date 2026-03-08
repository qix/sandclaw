import {
  listSpreadsheets,
  getSpreadsheet,
  readRange,
  updateCells,
  insertRows,
  type GoogleSheetsPluginConfig,
} from "./sheetsClient";

export function registerRoutes(
  app: any,
  db: any,
  config: GoogleSheetsPluginConfig,
) {
  // GET /list — list spreadsheets via Drive API
  app.get("/list", async (c: any) => {
    try {
      const spreadsheets = await listSpreadsheets(config);
      return c.json({ spreadsheets });
    } catch (e) {
      return c.json(
        { error: `Failed to list spreadsheets: ${(e as Error).message}` },
        500,
      );
    }
  });

  // POST /read — read a range from a spreadsheet
  app.post("/read", async (c: any) => {
    const body = (await c.req.json()) as {
      spreadsheetId?: string;
      range?: string;
    };
    const spreadsheetId = (body.spreadsheetId ?? "").trim();
    if (!spreadsheetId)
      return c.json({ error: "spreadsheetId is required" }, 400);
    const range = (body.range ?? "").trim();
    if (!range) return c.json({ error: "range is required" }, 400);

    try {
      const meta = await getSpreadsheet(config, spreadsheetId);
      const result = await readRange(config, spreadsheetId, range);
      return c.json({
        spreadsheetId,
        spreadsheetTitle: meta.title,
        range: result.range,
        values: result.values,
      });
    } catch (e) {
      return c.json(
        { error: `Failed to read range: ${(e as Error).message}` },
        500,
      );
    }
  });

  // POST /info — get spreadsheet metadata
  app.post("/info", async (c: any) => {
    const body = (await c.req.json()) as { spreadsheetId?: string };
    const spreadsheetId = (body.spreadsheetId ?? "").trim();
    if (!spreadsheetId)
      return c.json({ error: "spreadsheetId is required" }, 400);

    try {
      const meta = await getSpreadsheet(config, spreadsheetId);
      return c.json(meta);
    } catch (e) {
      return c.json(
        { error: `Failed to get spreadsheet info: ${(e as Error).message}` },
        500,
      );
    }
  });

  // POST /update — create verification request for cell update
  app.post("/update", async (c: any) => {
    const body = (await c.req.json()) as {
      spreadsheetId?: string;
      range?: string;
      values?: string[][];
    };
    const spreadsheetId = (body.spreadsheetId ?? "").trim();
    if (!spreadsheetId)
      return c.json({ error: "spreadsheetId is required" }, 400);
    const range = (body.range ?? "").trim();
    if (!range) return c.json({ error: "range is required" }, 400);
    if (!Array.isArray(body.values))
      return c.json({ error: "values must be a 2D array" }, 400);

    try {
      // Get spreadsheet metadata
      const meta = await getSpreadsheet(config, spreadsheetId);

      // Read current values at the target range
      let previousValues: string[][] = [];
      try {
        const current = await readRange(config, spreadsheetId, range);
        previousValues = current.values;
      } catch {
        // Range may not exist yet (empty cells)
      }

      // Parse sheet name from range
      const sheetName = range.includes("!")
        ? range.split("!")[0].replace(/^'(.*)'$/, "$1")
        : meta.sheets[0]?.title ?? "Sheet1";

      const now = Date.now();
      const verificationData = {
        spreadsheetId,
        spreadsheetTitle: meta.title,
        sheetName,
        range,
        previousValues,
        nextValues: body.values,
        createdAt: new Date(now).toISOString(),
      };

      const [id] = await db("verification_requests").insert({
        plugin: "google-sheets",
        action: "update_cells",
        data: JSON.stringify(verificationData),
        status: "pending",
        created_at: now,
        updated_at: now,
      });

      return c.json(
        {
          verificationRequestId: id,
          range,
          status: "pending",
        },
        202,
      );
    } catch (e) {
      return c.json(
        { error: `Failed to create update request: ${(e as Error).message}` },
        500,
      );
    }
  });

  // POST /insert-rows — create verification request for row insertion
  app.post("/insert-rows", async (c: any) => {
    const body = (await c.req.json()) as {
      spreadsheetId?: string;
      sheetName?: string;
      afterRow?: number;
      values?: string[][];
    };
    const spreadsheetId = (body.spreadsheetId ?? "").trim();
    if (!spreadsheetId)
      return c.json({ error: "spreadsheetId is required" }, 400);
    const sheetName = (body.sheetName ?? "").trim();
    if (!sheetName) return c.json({ error: "sheetName is required" }, 400);
    if (body.afterRow == null)
      return c.json({ error: "afterRow is required" }, 400);
    if (!Array.isArray(body.values))
      return c.json({ error: "values must be a 2D array" }, 400);

    try {
      const meta = await getSpreadsheet(config, spreadsheetId);

      const now = Date.now();
      const verificationData = {
        spreadsheetId,
        spreadsheetTitle: meta.title,
        sheetName,
        afterRow: body.afterRow,
        values: body.values,
        createdAt: new Date(now).toISOString(),
      };

      const [id] = await db("verification_requests").insert({
        plugin: "google-sheets",
        action: "insert_rows",
        data: JSON.stringify(verificationData),
        status: "pending",
        created_at: now,
        updated_at: now,
      });

      return c.json(
        {
          verificationRequestId: id,
          sheetName,
          afterRow: body.afterRow,
          rowCount: body.values.length,
          status: "pending",
        },
        202,
      );
    } catch (e) {
      return c.json(
        {
          error: `Failed to create insert rows request: ${(e as Error).message}`,
        },
        500,
      );
    }
  });

  // POST /approve/:id — approve and execute a write operation
  app.post("/approve/:id", async (c: any) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const request = await db("verification_requests").where("id", id).first();
    if (
      !request ||
      request.status !== "pending" ||
      request.plugin !== "google-sheets"
    ) {
      return c.json({ error: "Not found or already resolved" }, 404);
    }

    const verificationData = JSON.parse(request.data);

    try {
      if (request.action === "update_cells") {
        // Conflict detection: re-read current values to confirm they match
        let currentValues: string[][] = [];
        try {
          const current = await readRange(
            config,
            verificationData.spreadsheetId,
            verificationData.range,
          );
          currentValues = current.values;
        } catch {
          // Range may be empty
        }

        // Compare current values with what we stored as previousValues
        const prevStr = JSON.stringify(verificationData.previousValues);
        const currStr = JSON.stringify(currentValues);
        if (prevStr !== currStr) {
          return c.json(
            {
              error:
                "Spreadsheet changed since verification was created. Please re-request the update.",
            },
            409,
          );
        }

        // Execute the update
        const result = await updateCells(
          config,
          verificationData.spreadsheetId,
          verificationData.range,
          verificationData.nextValues,
        );

        await db("verification_requests")
          .where("id", id)
          .update({ status: "approved", updated_at: Date.now() });

        return c.json({
          success: true,
          updatedRange: result.updatedRange,
          updatedCells: result.updatedCells,
        });
      } else if (request.action === "insert_rows") {
        const result = await insertRows(
          config,
          verificationData.spreadsheetId,
          verificationData.sheetName,
          verificationData.afterRow,
          verificationData.values,
        );

        await db("verification_requests")
          .where("id", id)
          .update({ status: "approved", updated_at: Date.now() });

        return c.json({
          success: true,
          sheetName: result.sheetName,
          insertedAt: result.insertedAt,
          rowCount: result.rowCount,
        });
      } else {
        return c.json({ error: `Unknown action: ${request.action}` }, 400);
      }
    } catch (e) {
      return c.json(
        { error: `Failed to execute: ${(e as Error).message}` },
        500,
      );
    }
  });
}
