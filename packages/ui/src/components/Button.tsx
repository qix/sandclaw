import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'success' | 'danger';
}

export function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  return (
    <button className={`sc-btn sc-btn-${variant} ${className ?? ''}`} {...rest}>
      {children}
    </button>
  );
}
