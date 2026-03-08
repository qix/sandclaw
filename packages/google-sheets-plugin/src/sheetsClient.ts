export interface GoogleSheetsPluginConfig {
  /** Google OAuth2 client ID. */
  clientId: string;
  /** Google OAuth2 client secret. */
  clientSecret: string;
  /** OAuth2 refresh token. */
  refreshToken: string;
}

async function createOAuth2Client(config: GoogleSheetsPluginConfig) {
  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
  );
  oauth2Client.setCredentials({ refresh_token: config.refreshToken });
  return { google, oauth2Client };
}

export async function createSheetsClient(config: GoogleSheetsPluginConfig) {
  const { google, oauth2Client } = await createOAuth2Client(config);
  return google.sheets({ version: "v4", auth: oauth2Client });
}

export async function createDriveClient(config: GoogleSheetsPluginConfig) {
  const { google, oauth2Client } = await createOAuth2Client(config);
  return google.drive({ version: "v3", auth: oauth2Client });
}

/** List spreadsheet files accessible to the user via Google Drive. */
export async function listSpreadsheets(config: GoogleSheetsPluginConfig) {
  const drive = await createDriveClient(config);
  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id, name, modifiedTime, webViewLink)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });
  return (response.data.files ?? []).map((f) => ({
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
  const sheets = await createSheetsClient(config);
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields:
      "spreadsheetId,properties.title,sheets.properties(sheetId,title,gridProperties)",
  });
  const props = response.data.properties;
  const sheetList = (response.data.sheets ?? []).map((s) => ({
    sheetId: s.properties?.sheetId ?? 0,
    title: s.properties?.title ?? "",
    rowCount: s.properties?.gridProperties?.rowCount ?? 0,
    columnCount: s.properties?.gridProperties?.columnCount ?? 0,
  }));
  return {
    spreadsheetId: response.data.spreadsheetId ?? spreadsheetId,
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
  const sheets = await createSheetsClient(config);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
  });
  return {
    range: response.data.range ?? range,
    values: (response.data.values as string[][]) ?? [],
  };
}

/** Write values to a range. */
export async function updateCells(
  config: GoogleSheetsPluginConfig,
  spreadsheetId: string,
  range: string,
  values: string[][],
) {
  const sheets = await createSheetsClient(config);
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  return {
    updatedRange: response.data.updatedRange ?? range,
    updatedRows: response.data.updatedRows ?? 0,
    updatedColumns: response.data.updatedColumns ?? 0,
    updatedCells: response.data.updatedCells ?? 0,
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
  const sheets = await createSheetsClient(config);

  // First, get the sheetId from the sheet name
  const meta = await getSpreadsheet(config, spreadsheetId);
  const sheet = meta.sheets.find((s) => s.title === sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

  // Insert empty rows
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
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
    },
  });

  // Write values into the newly inserted rows
  const rangeNotation = `${sheetName}!A${afterRow + 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: rangeNotation,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

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
  const sheets = await createSheetsClient(config);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
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
    },
  });
  return { sheetId, deletedRows: endIndex - startIndex };
}
