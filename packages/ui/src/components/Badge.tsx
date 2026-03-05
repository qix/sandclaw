import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  bg?: string;
  fg?: string;
}

export function Badge({
  bg,
  fg,
  style,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={`sc-badge ${className ?? ""}`}
      style={{ background: bg, color: fg, ...style }}
      {...rest}
    >
      {children}
    </span>
  );
}
