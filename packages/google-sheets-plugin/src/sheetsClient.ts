import { execFile } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface GoogleSheetsPluginConfig {
  /** Google OAuth2 client ID. If omitted, gws uses its own auth. */
  clientId?: string;
  /** Google OAuth2 client secret. If omitted, gws uses its own auth. */
  clientSecret?: string;
  /** OAuth2 refresh token. If omitted, gws uses its own auth. */
  refreshToken?: string;
}

/** Path to the temporary credentials file written for gws. */
let credentialsFilePath: string | null = null;

/**
 * Write an authorized_user credentials file for gws if config has OAuth creds.
 * Returns env overrides to pass to gws.
 */
function getGwsEnv(config: GoogleSheetsPluginConfig): Record<string, string> {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    return {};
  }

  if (!credentialsFilePath) {
    const dir = join(tmpdir(), "gws-sandclaw");
    mkdirSync(dir, { recursive: true });
    credentialsFilePath = join(dir, "credentials.json");
    writeFileSync(
      credentialsFilePath,
      JSON.stringify({
        type: "authorized_user",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
      }),
    );
  }

  return {
    GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: credentialsFilePath,
    // Use a separate config dir so gws doesn't try to read the broken host credentials
    GOOGLE_WORKSPACE_CLI_CONFIG_DIR: join(tmpdir(), "gws-sandclaw"),
  };
}

/** Run a gws CLI command and return parsed JSON output. */
async function gws(
  config: GoogleSheetsPluginConfig,
  args: string[],
): Promise<any> {
  const envOverrides = getGwsEnv(config);

  return new Promise((resolve, reject) => {
    execFile("gws", args, {
      env: { ...process.env, ...envOverrides },
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        // gws outputs JSON errors on failure
        const output = stdout || stderr || error.message;
        try {
          const parsed = JSON.parse(output);
          if (parsed.error?.message) {
            reject(new Error(`gws: ${parsed.error.message}`));
            return;
          }
        } catch {}
        reject(new Error(`gws failed: ${output.slice(0, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`gws returned non-JSON: ${stdout.slice(0, 500)}`));
      }
    });
  });
}

/** List spreadsheet files accessible to the user via Google Drive. */
export async function listSpreadsheets(config: GoogleSheetsPluginConfig) {
  const data = await gws(config, [
    "drive", "files", "list",
    "--params", JSON.stringify({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: "files(id,name,modifiedTime,webViewLink)",
      orderBy: "modifiedTime desc",
      pageSize: 50,
    }),
  ]);

  return (data.files ?? []).map((f: any) => ({
    id: f.id ?? "",
    name: f.name ?? "",
    modifiedTime: f.modifiedTime ?? "",
    webViewLink: f.webViewLink ?? "",
  }));
}

/** Get spreadsheet metadata including sheet/tab names and grid dimensions. */
export async function getSpreadsheet(
  config: GoogleSheetsPluginConfig,
  spreadsheetId: string,
) {
  const data = await gws(config, [
    "sheets", "spreadsheets", "get",
    "--params", JSON.stringify({
      spreadsheetId,
      fields: "spreadsheetId,properties.title,sheets.properties(sheetId,title,gridProperties)",
    }),
  ]);

  const props = data.properties;
  const sheetList = (data.sheets ?? []).map((s: any) => ({
    sheetId: s.properties?.sheetId ?? 0,
    title: s.properties?.title ?? "",
    rowCount: s.properties?.gridProperties?.rowCount ?? 0,
    columnCount: s.properties?.gridProperties?.columnCount ?? 0,
  }));

  return {
    spreadsheetId: data.spreadsheetId ?? spreadsheetId,
    title: props?.title ?? "",
    sheets: sheetList,
  };
}

/** Read cell values from a range in A1 notation. */
export async function readRange(
  config: GoogleSheetsPluginConfig,
  spreadsheetId: string,
  range: string,
) {
  const data = await gws(config, [
    "sheets", "spreadsheets", "values", "get",
    "--params", JSON.stringify({
      spreadsheetId,
      range,
      valueRenderOption: "FORMATTED_VALUE",
    }),
  ]);

  return {
    range: data.range ?? range,
    values: (data.values as string[][]) ?? [],
  };
}

/** Write values to a range. */
export async function updateCells(
  config: GoogleSheetsPluginConfig,
  spreadsheetId: string,
  range: string,
  values: string[][],
) {
  const data = await gws(config, [
    "sheets", "spreadsheets", "values", "update",
    "--params", JSON.stringify({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
    }),
    "--json", JSON.stringify({ values }),
  ]);

  return {
    updatedRange: data.updatedRange ?? range,
    updatedRows: data.updatedRows ?? 0,
    updatedColumns: data.updatedColumns ?? 0,
    updatedCells: data.updatedCells ?? 0,
  };
}

/** Insert rows at a position and fill with values. */
export async function insertRows(
  config: GoogleSheetsPluginConfig,
  spreadsheetId: string,
  sheetName: string,
  afterRow: number,
  values: string[][],
) {
  // First, get the sheetId from the sheet name
  const meta = await getSpreadsheet(config, spreadsheetId);
  const sheet = meta.sheets.find((s: any) => s.title === sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

  // Insert empty rows via batchUpdate
  await gws(config, [
    "sheets", "spreadsheets", "batchUpdate",
    "--params", JSON.stringify({ spreadsheetId }),
    "--json", JSON.stringify({
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: sheet.sheetId,
              dimension: "ROWS",
              startIndex: afterRow,
              endIndex: afterRow + values.length,
            },
            inheritFromBefore: afterRow > 0,
          },
        },
      ],
    }),
  ]);

  // Write values into the newly inserted rows
  const rangeNotation = `${sheetName}!A${afterRow + 1}`;
  await gws(config, [
    "sheets", "spreadsheets", "values", "update",
    "--params", JSON.stringify({
      spreadsheetId,
      range: rangeNotation,
      valueInputOption: "USER_ENTERED",
    }),
    "--json", JSON.stringify({ values }),
  ]);

  return {
    sheetName,
    insertedAt: afterRow,
    rowCount: values.length,
  };
}

/** Delete rows by index range. */
export async function deleteRows(
  config: GoogleSheetsPluginConfig,
  spreadsheetId: string,
  sheetId: number,
  startIndex: number,
  endIndex: number,
) {
  await gws(config, [
    "sheets", "spreadsheets", "batchUpdate",
    "--params", JSON.stringify({ spreadsheetId }),
    "--json", JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex,
              endIndex,
            },
          },
        },
      ],
    }),
  ]);

  return { sheetId, deletedRows: endIndex - startIndex };
}
