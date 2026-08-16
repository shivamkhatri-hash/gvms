import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  action,
  className = '',
  noPadding = false,
}) => {
  const isGraphCard = className.includes('rounded-2xl') && className.includes('flex flex-col');

  if (isGraphCard) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 w-full flex flex-col p-5 shadow-none transition-none">
        {children}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-slate-200/80 shadow-card transition-all duration-200 hover:shadow-card-hover ${className}`}>
      {(title || action) && (
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            {title && <h3 className="text-base font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-6'}>{children}</div>
    </div>
  );
};
