import React, { createElement, type ComponentType } from "react";
import type { VerificationRendererProps } from "@sandclaw/gatekeeper-plugin-api";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Button,
  Badge,
  PageHeader,
  colors,
} from "@sandclaw/ui";

export interface VerificationRequest {
  id: number;
  plugin: string;
  action: string;
  data: string;
  status: string;
  createdAt: number;
  updatedAt?: number;
}

export interface VerificationHistoryPage {
  requests: VerificationRequest[];
  page: number;
  totalPages: number;
  total: number;
}

interface VerificationsPageProps {
  requests: VerificationRequest[];
  history?: VerificationHistoryPage;
  renderers: Record<string, ComponentType<VerificationRendererProps>>;
}

const pluginColors: Record<string, { bg: string; fg: string }> = {
  whatsapp: { bg: "oklch(0.60 0.17 152)", fg: "oklch(1 0 0)" },
  telegram: { bg: "oklch(0.55 0.21 260)", fg: "oklch(1 0 0)" },
  obsidian: { bg: "oklch(0.47 0.23 290)", fg: "oklch(1 0 0)" },
  gmail: { bg: "oklch(0.68 0.17 60)", fg: "oklch(1 0 0)" },
  browser: { bg: "oklch(0.60 0.20 40)", fg: "oklch(1 0 0)" },
};

function DefaultRenderer({ data }: VerificationRendererProps) {
  return <pre className="sc-pre">{JSON.stringify(data, null, 2)}</pre>;
}

function VerificationCard({
  r,
  renderers,
}: {
  r: VerificationRequest;
  renderers: Record<string, ComponentType<VerificationRendererProps>>;
}) {
  let parsed: any;
  try {
    parsed = JSON.parse(r.data);
  } catch {
    parsed = r.data;
  }

  const Renderer = renderers[r.plugin] ?? DefaultRenderer;
  const badgeColors = pluginColors[r.plugin] ?? {
    bg: colors.accent,
    fg: "oklch(1 0 0)",
  };
  const createdDate = new Date(r.createdAt).toLocaleString();
  const isResolved = r.status === "approved" || r.status === "rejected";
  const isRejected = r.status === "rejected";

  const cardStyle: React.CSSProperties = isResolved
    ? {
        opacity: 0.55,
        borderColor: isRejected ? "rgba(239, 68, 68, 0.35)" : undefined,
      }
    : {};

  const overlayStyle: React.CSSProperties | undefined = isRejected
    ? { background: "rgba(239, 68, 68, 0.06)" }
    : undefined;

  return (
    <Card key={r.id} style={cardStyle}>
      <CardHeader style={overlayStyle}>
        <div className="sc-flex-row">
          <Badge bg={badgeColors.bg} fg={badgeColors.fg}>
            {r.plugin}
          </Badge>
          <span
            className="sc-mono"
            style={{ fontSize: "0.85rem", color: colors.text }}
          >
            {r.action}
          </span>
          <span style={{ color: colors.muted }}>#{r.id}</span>
        </div>
        <div className="sc-flex-row">
          {isResolved && (
            <Badge
              bg={
                isRejected
                  ? "rgba(239, 68, 68, 0.2)"
                  : "rgba(139, 143, 163, 0.2)"
              }
              fg={isRejected ? colors.danger : colors.muted}
            >
              {r.status}
            </Badge>
          )}
          <span
            style={{
              fontSize: "0.8rem",
              color: colors.muted,
              whiteSpace: "nowrap",
            }}
          >
            {createdDate}
          </span>
        </div>
      </CardHeader>
      <CardBody style={overlayStyle}>
        {createElement(Renderer, { action: r.action, data: parsed })}
      </CardBody>
      {!isResolved && (
        <CardFooter>
          <form method="post" action={`/verifications/approve/${r.id}`}>
            <Button type="submit" variant="success">
              Approve
            </Button>
          </form>
          <form method="post" action={`/verifications/reject/${r.id}`}>
            <Button type="submit" variant="danger">
              Reject
            </Button>
          </form>
        </CardFooter>
      )}
    </Card>
  );
}

function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const items: React.ReactNode[] = [];
  // Always show first, last, current, and neighbors
  const show = new Set<number>();
  show.add(1);
  show.add(totalPages);
  for (
    let i = Math.max(1, page - 1);
    i <= Math.min(totalPages, page + 1);
    i++
  ) {
    show.add(i);
  }

  const sorted = Array.from(show).sort((a, b) => a - b);
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) {
      items.push(
        <span key={`gap-${p}`} className="sc-pagination-gap">
          &hellip;
        </span>,
      );
    }
    items.push(
      <a
        key={p}
        href={`?page=verifications&historyPage=${p}`}
        className={`sc-pagination-link ${p === page ? "active" : ""}`}
      >
        {p}
      </a>,
    );
    prev = p;
  }

  return (
    <nav className="sc-pagination">
      {page > 1 && (
        <a
          href={`?page=verifications&historyPage=${page - 1}`}
          className="sc-pagination-link"
        >
          &laquo; Prev
        </a>
      )}
      {items}
      {page < totalPages && (
        <a
          href={`?page=verifications&historyPage=${page + 1}`}
          className="sc-pagination-link"
        >
          Next &raquo;
        </a>
      )}
    </nav>
  );
}

export function VerificationsPage({
  requests,
  history,
  renderers,
}: VerificationsPageProps) {
  return (
    <div className="sc-section">
      <PageHeader
        title="Verifications"
        subtitle={
          requests.length > 0
            ? `${requests.length} pending action${requests.length !== 1 ? "s" : ""} awaiting human approval.`
            : undefined
        }
      />

      {requests.length === 0 && (
        <p style={{ color: colors.muted, marginBottom: "1.5rem" }}>
          No pending verification requests.
        </p>
      )}

      {requests.map((r) => (
        <VerificationCard key={r.id} r={r} renderers={renderers} />
      ))}

      {history && history.requests.length > 0 && (
        <>
          <div style={{ marginTop: requests.length > 0 ? "2rem" : "0.5rem" }}>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                color: colors.muted,
                marginBottom: "0.75rem",
              }}
            >
              History
              <span
                style={{
                  fontWeight: 400,
                  fontSize: "0.85rem",
                  marginLeft: "0.5rem",
                }}
              >
                ({history.total} resolved)
              </span>
            </h3>
          </div>
          {history.requests.map((r) => (
            <VerificationCard key={r.id} r={r} renderers={renderers} />
          ))}
          <Pagination page={history.page} totalPages={history.totalPages} />
        </>
      )}
    </div>
  );
}
