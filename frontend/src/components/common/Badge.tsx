import React from 'react';
import { TOC_COLORS } from '../../utils/constants';

interface BadgeProps {
  label: string;
  variant?: 'toc' | 's2' | 'role' | 'status' | 'custom';
  customColor?: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'custom',
  customColor,
  size = 'sm',
}) => {
  let style: React.CSSProperties = {};
  let classes = 'inline-flex items-center font-semibold rounded-md uppercase tracking-wider border shadow-2xs ';

  if (size === 'sm') {
    classes += 'px-2 py-0.5 text-[10px] ';
  } else {
    classes += 'px-2.5 py-1 text-xs ';
  }

  if (variant === 'toc' || variant === 's2') {
    const colorHex = TOC_COLORS[label] || '#64748B';
    style = {
      backgroundColor: `${colorHex}15`,
      color: colorHex,
      borderColor: `${colorHex}40`,
    };
  } else if (customColor) {
    classes += customColor;
  } else {
    classes += 'bg-slate-100 text-slate-700 border-slate-200';
  }

  return (
    <span className={classes} style={style}>
      {label}
    </span>
  );
};
