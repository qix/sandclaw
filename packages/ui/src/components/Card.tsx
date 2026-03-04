import React from 'react';

export function Card({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`sc-card ${className ?? ''}`} {...rest}>{children}</div>;
}

export function CardHeader({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`sc-card-header ${className ?? ''}`} {...rest}>{children}</div>;
}

export function CardBody({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`sc-card-body ${className ?? ''}`} {...rest}>{children}</div>;
}

export function CardFooter({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`sc-card-footer ${className ?? ''}`} {...rest}>{children}</div>;
}
