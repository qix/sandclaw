const MAX_DIFF_PREVIEW_LINES = 500;
const LCS_MATRIX_LIMIT = 90_000;

export interface DiffLine {
  type: "context" | "add" | "remove";
  text: string;
}

export interface DiffPreview {
  lines: DiffLine[];
  added: number;
  removed: number;
  unchanged: number;
  truncated: boolean;
  totalLines: number;
}

export function computeDiff(before: string, after: string): DiffPreview {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  let diffLines: DiffLine[];

  if (beforeLines.length * afterLines.length <= LCS_MATRIX_LIMIT) {
    diffLines = lcsDiff(beforeLines, afterLines);
  } else {
    diffLines = prefixSuffixDiff(beforeLines, afterLines);
  }

  const totalLines = diffLines.length;
  const truncated = totalLines > MAX_DIFF_PREVIEW_LINES;
  const lines = truncated
    ? diffLines.slice(0, MAX_DIFF_PREVIEW_LINES)
    : diffLines;

  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const line of diffLines) {
    if (line.type === "add") added++;
    else if (line.type === "remove") removed++;
    else unchanged++;
  }

  return { lines, added, removed, unchanged, truncated, totalLines };
}

function lcsDiff(before: string[], after: string[]): DiffLine[] {
  const m = before.length;
  const n = after.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (before[i - 1] === after[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && before[i - 1] === after[j - 1]) {
      result.push({ type: "context", text: before[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "add", text: after[j - 1] });
      j--;
    } else {
      result.push({ type: "remove", text: before[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

function prefixSuffixDiff(before: string[], after: string[]): DiffLine[] {
  // Find common prefix
  let prefixLen = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefixLen < maxPrefix && before[prefixLen] === after[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix (not overlapping with prefix)
  let suffixLen = 0;
  const maxSuffix = Math.min(
    before.length - prefixLen,
    after.length - prefixLen,
  );
  while (
    suffixLen < maxSuffix &&
    before[before.length - 1 - suffixLen] ===
      after[after.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const result: DiffLine[] = [];

  // Prefix (context)
  for (let i = 0; i < prefixLen; i++) {
    result.push({ type: "context", text: before[i] });
  }

  // Middle removed
  for (let i = prefixLen; i < before.length - suffixLen; i++) {
    result.push({ type: "remove", text: before[i] });
  }

  // Middle added
  for (let i = prefixLen; i < after.length - suffixLen; i++) {
    result.push({ type: "add", text: after[i] });
  }

  // Suffix (context)
  for (let i = before.length - suffixLen; i < before.length; i++) {
    result.push({ type: "context", text: before[i] });
  }

  return result;
}
