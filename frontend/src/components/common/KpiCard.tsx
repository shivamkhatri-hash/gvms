import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  accentColorClass?: string; // e.g. "border-l-ongc-blue", "border-l-amber-500"
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  description,
  icon,
  accentColorClass = 'border-l-ongc-blue',
  className = '',
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200/80 shadow-card transition-all duration-200 hover:shadow-card-hover border-l-4 ${accentColorClass} ${className} ${
        isCollapsed ? 'py-3.5 px-5' : 'p-5'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon && <div className="text-slate-500 shrink-0">{icon}</div>}
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
            {title}
          </p>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
          className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded hover:bg-slate-50 flex items-center justify-center shrink-0"
        >
          {isCollapsed ? (
            <Plus className="w-3.5 h-3.5" />
          ) : (
            <Minus className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {!isCollapsed && (
        <div className="mt-1 flex flex-col justify-end">
          <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none py-1 truncate">
            {value}
          </h3>
          {description && (
            <p className="text-[9px] text-slate-400 mt-0.5 truncate">
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
