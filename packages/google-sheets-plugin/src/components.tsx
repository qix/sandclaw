import React from "react";
import type { VerificationRendererProps } from "@sandclaw/gatekeeper-plugin-api";
import { colors } from "@sandclaw/ui";

export function GoogleSheetsPanel() {
  return (
    <div style={{ padding: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Google Sheets</h2>
      <p style={{ color: colors.muted }}>
        Provides read and write access to Google Sheets spreadsheets. Reading is
        safe (no verification needed). Writing requires human approval with a
        spreadsheet-styled diff preview.
      </p>
      <section>
        <h3>Capabilities</h3>
        <ul style={{ lineHeight: "1.8" }}>
          <li>
            <strong>List:</strong> List spreadsheets accessible by the user
          </li>
          <li>
            <strong>Info:</strong> Get spreadsheet metadata (title, sheet names,
            dimensions)
          </li>
          <li>
            <strong>Read:</strong> Read cell ranges in A1 notation (no
            verification)
          </li>
          <li>
            <strong>Update:</strong> Update cells in a range (requires approval
            with diff preview)
          </li>
          <li>
            <strong>Insert Rows:</strong> Insert rows at a position (requires
            approval)
          </li>
        </ul>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending write requests.</p>
      </section>
    </div>
  );
}

/**
 * Parse an A1 range like "Sheet1!B2:D5" to extract the start column letter and row number.
 */
function parseRange(range: string): { startCol: string; startRow: number } {
  // Strip sheet name if present
  const cellPart = range.includes("!") ? range.split("!")[1] : range;
  // Match the start of the range (e.g., "B2" from "B2:D5")
  const match = cellPart.match(/^([A-Z]+)(\d+)/i);
  if (!match) return { startCol: "A", startRow: 1 };
  return { startCol: match[1].toUpperCase(), startRow: parseInt(match[2], 10) };
}

/**
 * Convert a 0-based column index + start column letter to a column label.
 */
function columnLabel(startCol: string, offset: number): string {
  // Convert startCol to number (A=0, B=1, ..., Z=25, AA=26, ...)
  let base = 0;
  for (let i = 0; i < startCol.length; i++) {
    base = base * 26 + (startCol.charCodeAt(i) - 64);
  }
  // base is now 1-indexed (A=1), convert to 0-indexed
  const colNum = base - 1 + offset;
  // Convert back to letters
  let label = "";
  let n = colNum;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

const monoFont =
  "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', Menlo, Monaco, Consolas, monospace";

const tableBorder = `1px solid ${colors.border}`;

const cellStyle: React.CSSProperties = {
  padding: "0.35rem 0.6rem",
  border: tableBorder,
  fontFamily: monoFont,
  fontSize: "0.82rem",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  background: colors.surface,
  color: colors.muted,
  fontWeight: 600,
  textAlign: "center",
  fontSize: "0.75rem",
};

const rowNumberStyle: React.CSSProperties = {
  ...cellStyle,
  background: colors.surface,
  color: colors.muted,
  fontWeight: 600,
  textAlign: "center",
  fontSize: "0.75rem",
  width: "3em",
};

function UpdateCellsRenderer({ data }: { data: any }) {
  const spreadsheetTitle = data?.spreadsheetTitle ?? "Untitled";
  const sheetName = data?.sheetName ?? "";
  const range = data?.range ?? "";
  const previousValues: string[][] = data?.previousValues ?? [];
  const nextValues: string[][] = data?.nextValues ?? [];

  const { startCol, startRow } = parseRange(range);

  // Determine dimensions (max of prev and next)
  const rowCount = Math.max(previousValues.length, nextValues.length);
  const colCount = Math.max(
    ...previousValues.map((r) => r.length),
    ...nextValues.map((r) => r.length),
    0,
  );

  // Count changes
  let changedCount = 0;
  const totalCells = rowCount * colCount;
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const prev = previousValues[r]?.[c] ?? "";
      const next = nextValues[r]?.[c] ?? "";
      if (prev !== next) changedCount++;
    }
  }

  return (
    <div>
      <div
        style={{
          marginBottom: "0.75rem",
          display: "flex",
          gap: "1rem",
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: "0.85rem", color: colors.muted }}>
          <strong style={{ color: colors.text }}>{spreadsheetTitle}</strong>
          {sheetName && (
            <span>
              {" "}
              / <span style={{ fontFamily: "monospace" }}>{sheetName}</span>
            </span>
          )}
        </div>
        <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: colors.muted }}>
          {range}
        </span>
      </div>

      <div
        style={{
          marginBottom: "0.5rem",
          fontSize: "0.8rem",
          color: colors.muted,
        }}
      >
        {changedCount} cell{changedCount !== 1 ? "s" : ""} changed out of{" "}
        {totalCells} total
      </div>

      <div
        style={{
          border: tableBorder,
          borderRadius: "0.5rem",
          overflow: "auto",
          maxHeight: "400px",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            background: colors.diffBg,
          }}
        >
          <thead>
            <tr>
              <th style={headerCellStyle}></th>
              {Array.from({ length: colCount }, (_, i) => (
                <th key={i} style={headerCellStyle}>
                  {columnLabel(startCol, i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, r) => (
              <tr key={r}>
                <td style={rowNumberStyle}>{startRow + r}</td>
                {Array.from({ length: colCount }, (_, c) => {
                  const prev = previousValues[r]?.[c] ?? "";
                  const next = nextValues[r]?.[c] ?? "";
                  const changed = prev !== next;

                  return (
                    <td
                      key={c}
                      style={{
                        ...cellStyle,
                        background: changed ? undefined : "transparent",
                      }}
                    >
                      {changed ? (
                        <div>
                          {prev && (
                            <div
                              style={{
                                background: colors.diffRemoveBg,
                                color: colors.diffRemoveFg,
                                textDecoration: "line-through",
                                padding: "0.1rem 0.3rem",
                                borderRadius: "0.2rem",
                                marginBottom: next ? "0.2rem" : undefined,
                              }}
                            >
                              {prev}
                            </div>
                          )}
                          {next && (
                            <div
                              style={{
                                background: colors.diffAddBg,
                                color: colors.diffAddFg,
                                padding: "0.1rem 0.3rem",
                                borderRadius: "0.2rem",
                              }}
                            >
                              {next}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span>{prev}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InsertRowsRenderer({ data }: { data: any }) {
  const spreadsheetTitle = data?.spreadsheetTitle ?? "Untitled";
  const sheetName = data?.sheetName ?? "";
  const afterRow: number = data?.afterRow ?? 0;
  const values: string[][] = data?.values ?? [];

  const colCount = Math.max(...values.map((r) => r.length), 0);

  return (
    <div>
      <div
        style={{
          marginBottom: "0.75rem",
          display: "flex",
          gap: "1rem",
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: "0.85rem", color: colors.muted }}>
          <strong style={{ color: colors.text }}>{spreadsheetTitle}</strong>
          {sheetName && (
            <span>
              {" "}
              / <span style={{ fontFamily: "monospace" }}>{sheetName}</span>
            </span>
          )}
        </div>
        <span style={{ fontSize: "0.8rem", color: colors.muted }}>
          Insert {values.length} row{values.length !== 1 ? "s" : ""} after row{" "}
          {afterRow}
        </span>
      </div>

      <div
        style={{
          border: tableBorder,
          borderRadius: "0.5rem",
          overflow: "auto",
          maxHeight: "400px",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            background: colors.diffBg,
          }}
        >
          <thead>
            <tr>
              <th style={headerCellStyle}></th>
              {Array.from({ length: colCount }, (_, i) => (
                <th key={i} style={headerCellStyle}>
                  {columnLabel("A", i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((row, r) => (
              <tr key={r}>
                <td style={rowNumberStyle}>{afterRow + r + 1}</td>
                {Array.from({ length: colCount }, (_, c) => (
                  <td
                    key={c}
                    style={{
                      ...cellStyle,
                      background: colors.diffAddBg,
                      color: colors.diffAddFg,
                    }}
                  >
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function GoogleSheetsVerificationRenderer({
  data,
  action,
}: VerificationRendererProps) {
  if (action === "update_cells") {
    return <UpdateCellsRenderer data={data} />;
  }
  if (action === "insert_rows") {
    return <InsertRowsRenderer data={data} />;
  }

  // Fallback for unknown actions
  return (
    <pre
      style={{
        margin: 0,
        padding: "1rem",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: "0.5rem",
        fontSize: "0.85rem",
        fontFamily: "monospace",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
