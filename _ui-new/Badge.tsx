import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', size = 'md' }) => {
  const variants: Record<NonNullable<BadgeProps['variant']>, string> = {
    default: 'bg-red-50 text-brand-700 ring-1 ring-red-200',
    success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    danger: 'onyx-brand-gradient text-white shadow-glow-red',
    info: 'bg-sky-50 text-brand-700 ring-1 ring-red-200',
    outline: 'border border-red-200 bg-white text-brand-700',
  };
  const sizes = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
};