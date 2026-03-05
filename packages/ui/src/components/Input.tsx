import React from "react";

export function Input({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`sc-input ${className ?? ""}`} {...rest} />;
}
