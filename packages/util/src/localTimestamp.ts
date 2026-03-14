/** Return an ISO8601 timestamp string using the local timezone offset. */
export function localTimestamp(date: Date = new Date()): string {
  const off = date.getTimezoneOffset();
  const local = new Date(date.getTime() - off * 60_000);
  const base = local.toISOString().slice(0, -1); // remove trailing Z
  if (off === 0) return base + "Z";
  const sign = off <= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `${base}${sign}${h}:${m}`;
}
