---
name: gws-sheets-append
version: 1.0.0
description: "Google Sheets: Append a row to a spreadsheet."
metadata:
  openclaw:
    category: "productivity"
    requires:
      tools: ["google_workspace_exec"]
---

# sheets +append

> **PREREQUISITE:** Read `../gws-shared/SKILL.md` for global flags, and security rules.

Append a row to a spreadsheet.

If you are not sure of the column names, please read the existing spreadsheet first.

## Usage

```
google_workspace_exec command: ["sheets", "+append", "--spreadsheet", "<ID>"]
```

## Flags

| Flag            | Required | Default | Description                                      |
| --------------- | -------- | ------- | ------------------------------------------------ |
| `--spreadsheet` | ✓        | —       | Spreadsheet ID                                   |
| `--values`      | —        | —       | Comma-separated values (simple strings)          |
| `--json-values` | —        | —       | JSON array of rows, e.g. '[["a","b"],["c","d"]]' |

## Examples

```
google_workspace_exec command: ["sheets", "+append", "--spreadsheet", "ID", "--values", "Alice,100,true"]
google_workspace_exec command: ["sheets", "+append", "--spreadsheet", "ID", "--json-values", "[[\\"a\\",\\"b\\"],[\\"c\\",\\"d\\"]]"]
```

## Tips

- Use --values for simple single-row appends.
- Use --json-values for bulk multi-row inserts.

> [!CAUTION]
> This is a **write** command — confirm with the user before executing.

## See Also

- [gws-shared](../gws-shared/SKILL.md) — Global flags and auth
- [gws-sheets](../gws-sheets/SKILL.md) — All read and write spreadsheets commands
