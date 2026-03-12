---
name: gws-sheets-read
version: 1.0.0
description: "Google Sheets: Read values from a spreadsheet."
metadata:
  openclaw:
    category: "productivity"
    requires:
      tools: ["google_workspace_read"]
---

# sheets +read

> **PREREQUISITE:** Read `../gws-shared/SKILL.md` for auth, global flags, and security rules. If missing, run `gws generate-skills` to create it.

Read values from a spreadsheet

## Usage

```
google_workspace_read command: ["sheets", "+read", "--spreadsheet", "<ID>", "--range", "<RANGE>"]
```

## Flags

| Flag            | Required | Default | Description                         |
| --------------- | -------- | ------- | ----------------------------------- |
| `--spreadsheet` | ✓        | —       | Spreadsheet ID                      |
| `--range`       | ✓        | —       | Range to read (e.g. 'Sheet1!A1:B2') |

## Examples

```
google_workspace_read command: ["sheets", "+read", "--spreadsheet", "ID", "--range", "Sheet1!A1:D10"]
google_workspace_read command: ["sheets", "+read", "--spreadsheet", "ID", "--range", "Sheet1"]
```

## Tips

- Read-only — never modifies the spreadsheet.
- For advanced options, use the raw values.get API.

## See Also

- [gws-shared](../gws-shared/SKILL.md) — Global flags and auth
- [gws-sheets](../gws-sheets/SKILL.md) — All read and write spreadsheets commands
