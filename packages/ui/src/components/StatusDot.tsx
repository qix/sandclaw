import React from 'react';

interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  color: 'green' | 'yellow' | 'red' | 'gray';
}

export function StatusDot({ color, className, ...rest }: StatusDotProps) {
  return <span className={`sc-status-dot sc-status-dot-${color} ${className ?? ''}`} {...rest} />;
}
