import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
    const variants = {
      primary: 'onyx-brand-gradient text-white shadow-glow-red hover:brightness-105 active:scale-[0.98]',
      secondary: 'border border-red-200 bg-white text-brand-700 hover:bg-red-50',
      outline: 'border border-red-300 bg-transparent text-brand-700 hover:bg-red-50',
      danger: 'onyx-brand-gradient text-white shadow-glow-red hover:brightness-105 active:scale-[0.98]',
      ghost: 'bg-transparent text-brand-700 hover:bg-red-50',
    };
    const sizes = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-10 px-5 text-sm',
      lg: 'h-12 px-6 text-base',
    };
    const cls = `${baseClasses} ${variants[variant]} ${sizes[size]} ${className || ''}`;

    return (
      <button ref={ref} className={cls} disabled={disabled || loading} {...props}>
        {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
      </button>
    );
  }
);
Button.displayName = 'Button';