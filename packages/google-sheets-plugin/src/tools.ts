import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";
import {
  listSpreadsheets,
  getSpreadsheet,
  readRange,
  type GoogleSheetsPluginConfig,
} from "./sheetsClient";

export function createListTool(
  ctx: MuteworkerPluginContext,
  config: GoogleSheetsPluginConfig,
) {
  return {
    name: "google_sheets_list",
    label: "List Google Sheets",
    description:
      "List spreadsheets accessible by the user's Google account. Returns spreadsheet IDs and names.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, _params: any) => {
      const spreadsheets = await listSpreadsheets(config);
      ctx.artifacts.push({
        type: "text",
        label: "Google Sheets List",
        value: `${spreadsheets.length} spreadsheets`,
      });

      if (!spreadsheets.length) {
        return {
          content: [{ type: "text", text: "No spreadsheets found." }],
        };
      }

      const rendered = spreadsheets
        .map(
          (s: any, i: number) =>
            `${i + 1}. ${s.name} (id: ${s.id})${s.modifiedTime ? `\n   Modified: ${s.modifiedTime}` : ""}`,
        )
        .join("\n\n");

      return { content: [{ type: "text", text: rendered }] };
    },
  };
}

export function createReadTool(
  ctx: MuteworkerPluginContext,
  config: GoogleSheetsPluginConfig,
) {
  return {
    name: "google_sheets_read",
    label: "Read Google Sheet Range",
    description:
      "Read a range of cells from a Google Sheets spreadsheet. Use A1 notation for the range (e.g., 'Sheet1!A1:C10').",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        range: { type: "string" },
      },
      required: ["spreadsheetId", "range"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const spreadsheetId = String(params.spreadsheetId ?? "").trim();
      if (!spreadsheetId) throw new Error("spreadsheetId is required");
      const range = String(params.range ?? "").trim();
      if (!range) throw new Error("range is required");

      const meta = await getSpreadsheet(config, spreadsheetId);
      const result = await readRange(config, spreadsheetId, range);

      ctx.artifacts.push({
        type: "text",
        label: "Google Sheets Read",
        value: `${meta.title}: ${result.range}`,
      });

      const values: string[][] = result.values ?? [];
      if (!values.length) {
        return {
          content: [
            { type: "text", text: `No data found in range ${result.range}.` },
          ],
        };
      }

      // Format as a simple table
      const rendered = values
        .map((row: string[]) => row.join("\t"))
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `${meta.title} — ${result.range}\n\n${rendered}`,
          },
        ],
      };
    },
  };
}

export function createInfoTool(
  ctx: MuteworkerPluginContext,
  config: GoogleSheetsPluginConfig,
) {
  return {
    name: "google_sheets_info",
    label: "Google Sheet Info",
    description:
      "Get metadata about a Google Sheets spreadsheet including title, sheet names, and dimensions.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
      },
      required: ["spreadsheetId"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const spreadsheetId = String(params.spreadsheetId ?? "").trim();
      if (!spreadsheetId) throw new Error("spreadsheetId is required");

      const data = await getSpreadsheet(config, spreadsheetId);
      ctx.artifacts.push({
        type: "text",
        label: "Google Sheets Info",
        value: data.title,
      });

      const sheetsInfo = (data.sheets ?? [])
        .map(
          (s: any) =>
            `  - ${s.title} (${s.rowCount} rows x ${s.columnCount} cols)`,
        )
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Spreadsheet: ${data.title}\nID: ${data.spreadsheetId}\n\nSheets:\n${sheetsInfo}`,
          },
        ],
      };
    },
  };
}

export function createUpdateTool(
  ctx: MuteworkerPluginContext,
  _config: GoogleSheetsPluginConfig,
) {
  return {
    name: "google_sheets_update",
    label: "Update Google Sheet Cells",
    description:
      "Update cells in a Google Sheets spreadsheet. Creates a verification request that must be approved by a human before the change is applied. Use A1 notation for the range.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        range: { type: "string" },
        values: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
        },
      },
      required: ["spreadsheetId", "range", "values"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const spreadsheetId = String(params.spreadsheetId ?? "").trim();
      if (!spreadsheetId) throw new Error("spreadsheetId is required");
      const range = String(params.range ?? "").trim();
      if (!range) throw new Error("range is required");
      if (!Array.isArray(params.values))
        throw new Error("values must be a 2D array");

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/google-sheets/update`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            spreadsheetId,
            range,
            values: params.values,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Google Sheets update failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as any;
      ctx.artifacts.push({
        type: "text",
        label: "Google Sheets Update Request",
        value: `${data.range} (#${data.verificationRequestId})`,
      });

      return {
        content: [
          {
            type: "text",
            text: [
              `Queued Google Sheets update verification #${data.verificationRequestId}.`,
              "No cells have been changed yet.",
              `Range: ${data.range}`,
              `Status: ${data.status}`,
              `Open ${ctx.gatekeeperExternalUrl} to review and approve this change.`,
            ].join("\n"),
          },
        ],
      };
    },
  };
}

export function createInsertRowsTool(
  ctx: MuteworkerPluginContext,
  _config: GoogleSheetsPluginConfig,
) {
  return {
    name: "google_sheets_insert_rows",
    label: "Insert Rows into Google Sheet",
    description:
      "Insert one or more rows into a Google Sheets spreadsheet after a given row number. Creates a verification request that must be approved by a human before the change is applied.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        sheetName: { type: "string" },
        afterRow: { type: "number" },
        values: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
        },
      },
      required: ["spreadsheetId", "sheetName", "afterRow", "values"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const spreadsheetId = String(params.spreadsheetId ?? "").trim();
      if (!spreadsheetId) throw new Error("spreadsheetId is required");
      const sheetName = String(params.sheetName ?? "").trim();
      if (!sheetName) throw new Error("sheetName is required");
      if (params.afterRow == null) throw new Error("afterRow is required");
      if (!Array.isArray(params.values))
        throw new Error("values must be a 2D array");

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/google-sheets/insert-rows`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            spreadsheetId,
            sheetName,
            afterRow: Math.floor(Number(params.afterRow)),
            values: params.values,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Google Sheets insert rows failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as any;
      ctx.artifacts.push({
        type: "text",
        label: "Google Sheets Insert Rows Request",
        value: `${sheetName} row ${params.afterRow} (#${data.verificationRequestId})`,
      });

      return {
        content: [
          {
            type: "text",
            text: [
              `Queued Google Sheets insert rows verification #${data.verificationRequestId}.`,
              "No rows have been inserted yet.",
              `Sheet: ${sheetName}`,
              `After row: ${params.afterRow}`,
              `Rows to insert: ${params.values.length}`,
              `Status: ${data.status}`,
              `Open ${ctx.gatekeeperExternalUrl} to review and approve this change.`,
            ].join("\n"),
          },
        ],
      };
    },
  };
}
