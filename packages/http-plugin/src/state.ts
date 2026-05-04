// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Knex = any;

const RECENT_LIMIT = 100;

export interface HttpRequestRow {
  id: number;
  jobId: number | null;
  method: string;
  url: string;
  domain: string;
  outcome: "allowed" | "blocked" | "error";
  statusCode: number | null;
  responseBytes: number | null;
  error: string | null;
  createdAt: string;
}

export interface HttpAllowEntry {
  id: number;
  method: string;
  domain: string;
  createdAt: string;
}

export const httpState = {
  recent: [] as HttpRequestRow[],
  allowList: [] as HttpAllowEntry[],
};

function rowToRequest(r: any): HttpRequestRow {
  return {
    id: r.id,
    jobId: r.job_id ?? null,
    method: r.method,
    url: r.url,
    domain: r.domain,
    outcome: r.outcome,
    statusCode: r.status_code ?? null,
    responseBytes: r.response_bytes ?? null,
    error: r.error ?? null,
    createdAt: r.created_at,
  };
}

function rowToAllow(r: any): HttpAllowEntry {
  return {
    id: r.id,
    method: r.method,
    domain: r.domain,
    createdAt: r.created_at,
  };
}

export async function loadHttpState(db: Knex): Promise<void> {
  const reqRows = await db("http_requests")
    .orderBy("id", "desc")
    .limit(RECENT_LIMIT);
  httpState.recent = reqRows.map(rowToRequest);

  const allowRows = await db("http_allow_list").orderBy("id", "desc");
  httpState.allowList = allowRows.map(rowToAllow);
}

export async function reloadAllowList(db: Knex): Promise<void> {
  const allowRows = await db("http_allow_list").orderBy("id", "desc");
  httpState.allowList = allowRows.map(rowToAllow);
}

export function pushRequest(row: HttpRequestRow): void {
  httpState.recent.unshift(row);
  if (httpState.recent.length > RECENT_LIMIT) {
    httpState.recent.length = RECENT_LIMIT;
  }
}

export function isAllowed(method: string, domain: string): boolean {
  const m = method.toUpperCase();
  const d = domain.toLowerCase();
  return httpState.allowList.some(
    (e) => e.method.toUpperCase() === m && e.domain.toLowerCase() === d,
  );
}
