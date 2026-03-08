import React, { createContext, useContext } from "react";
import type { StatusColorValue } from "./index";

/** Provided by the gateway's App shell so Tab components know which page is active. */
export const NavigationContext = createContext({ activePage: "" });

/** Controls whether TabLink renders as a sidebar entry or a mobile dropdown item. */
export const TabVariantContext = createContext<"sidebar" | "dropdown">(
  "sidebar",
);

export interface TabLinkProps {
  href: string;
  title: string;
  statusColor?: StatusColorValue;
}

/**
 * Shared component for rendering a tab entry.  Reads NavigationContext for
 * active-page highlighting and TabVariantContext for sidebar vs dropdown style.
 */
export function TabLink({ href, title, statusColor }: TabLinkProps) {
  const { activePage } = useContext(NavigationContext);
  const variant = useContext(TabVariantContext);
  const isActive = href === `?page=${activePage}`;

  if (variant === "dropdown") {
    return (
      <a
        href={href}
        className={`sc-dropdown-item ${isActive ? "active" : ""}`}
        role="menuitem"
      >
        <span className="sc-dropdown-check">{isActive ? "\u2713" : ""}</span>
        {statusColor && (
          <span className={`sc-status-dot sc-status-dot-${statusColor}`} />
        )}
        {title}
      </a>
    );
  }

  return (
    <a href={href} className={`sc-nav-link ${isActive ? "active" : ""}`}>
      {statusColor && (
        <span className={`sc-status-dot sc-status-dot-${statusColor}`} />
      )}
      {title}
    </a>
  );
}
