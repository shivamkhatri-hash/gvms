import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';

interface CustomPlotProps {
  data: any[];
  layout: any;
  config?: any;
  className?: string;
  useResizeHandler?: boolean;
  onClick?: (data: any) => void;
  [key: string]: any;
}

const DEFAULT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#8b5cf6', '#f59e0b',
  '#ec4899', '#22c55e', '#6366f1', '#84cc16', '#14b8a6',
  '#d97706', '#4f46e5', '#db2777', '#059669', '#7c3aed',
  '#9333ea', '#ea580c', '#be123c'
];

const PlotlySymbol: React.FC<{ symbol?: string; color: string; size?: number }> = ({ symbol = 'circle', color, size = 12 }) => {
  const normSymbol = String(symbol).toLowerCase();

  // If trace color is transparent or has low opacity, display a solid color for the legend
  let displayColor = color;
  if (color.startsWith('rgba')) {
    if (color.includes('0.05') || color.includes('0.1') || color.includes('0.2')) {
      // Background zone colors - replace with solid matching colors
      if (color.includes('59, 130, 246')) displayColor = '#3b82f6';
      else if (color.includes('245, 158, 11')) displayColor = '#f59e0b';
      else if (color.includes('16, 185, 129')) displayColor = '#10b981';
      else if (color.includes('239, 68, 68')) displayColor = '#ef4444';
    }
  }

  if (normSymbol.includes('square')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <rect x="1" y="1" width="10" height="10" fill={displayColor} stroke="none" />
        {normSymbol.includes('cross') && (
          <>
            <line x1="6" y1="1" x2="6" y2="11" stroke="white" strokeWidth="1.5" />
            <line x1="1" y1="6" x2="11" y2="6" stroke="white" strokeWidth="1.5" />
          </>
        )}
      </svg>
    );
  }

  if (normSymbol.includes('diamond')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="6,1 11,6 6,11 1,6" fill={displayColor} stroke="none" />
        {normSymbol.includes('cross') && (
          <>
            <line x1="6" y1="1" x2="6" y2="11" stroke="white" strokeWidth="1.5" />
            <line x1="1" y1="6" x2="11" y2="6" stroke="white" strokeWidth="1.5" />
          </>
        )}
      </svg>
    );
  }

  if (normSymbol.includes('triangle-up')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="6,1 11,11 1,11" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('triangle-down')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="1,1 11,1 6,11" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('triangle-left')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="11,1 1,6 11,11" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('triangle-right')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="1,1 11,6 1,11" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('pentagon')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="6,1 11,5 9,11 3,11 1,5" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('star')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="6,1 7.5,4.5 11,5 8,7.5 9,11 6,9 3,11 4,7.5 1,5 4.5,4.5" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('hexagram')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="6,1 8,4.5 11,3 9,6 11,9 8,7.5 6,11 4,7.5 1,9 3,6 1,3 4,4.5" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('hourglass')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="1,1 11,1 6,6 1,11 11,11" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('bowtie')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="1,1 1,11 6,6 11,11 11,1" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('x') || normSymbol === 'x') {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <line x1="2" y1="2" x2="10" y2="10" stroke={displayColor} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="10" y1="2" x2="2" y2="10" stroke={displayColor} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (normSymbol.includes('cross') || normSymbol.includes('asterisk')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <line x1="6" y1="1.5" x2="6" y2="10.5" stroke={displayColor} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="1.5" y1="6" x2="10.5" y2="6" stroke={displayColor} strokeWidth="2.5" strokeLinecap="round" />
        {normSymbol.includes('asterisk') && (
          <>
            <line x1="3" y1="3" x2="9" y2="9" stroke={displayColor} strokeWidth="2" strokeLinecap="round" />
            <line x1="9" y1="3" x2="3" y2="9" stroke={displayColor} strokeWidth="2" strokeLinecap="round" />
          </>
        )}
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
      <circle cx="6" cy="6" r="5" fill={displayColor} stroke="none" />
      {normSymbol.includes('cross') && (
        <>
          <line x1="6" y1="2.5" x2="6" y2="9.5" stroke="white" strokeWidth="1.5" />
          <line x1="2.5" y1="6" x2="9.5" y2="6" stroke="white" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
};

export const CustomPlot: React.FC<CustomPlotProps> = ({
  data = [],
  layout,
  config,
  className,
  useResizeHandler = true,
  onClick,
  ...props
}) => {
  const [hiddenTraces, setHiddenTraces] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initialHidden: Record<string, boolean> = {};
    data.forEach((trace) => {
      if (trace && trace.name && (trace.visible === 'legendonly' || trace.visible === false)) {
        initialHidden[trace.name] = true;
      }
    });
    setHiddenTraces(initialHidden);
  }, [data]);

  const toggleTrace = (name: string) => {
    setHiddenTraces((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  const finalLayout = {
    ...layout,
    showlegend: false,
  };

  const finalData = data.map((trace) => {
    if (trace && trace.name && hiddenTraces[trace.name]) {
      return { ...trace, visible: 'legendonly' };
    }
    return trace;
  });

  const legendItems = data
    .map((trace, index) => {
      if (trace && trace.name && trace.showlegend !== false) {
        let color = '#475569';
        if (trace.marker && trace.marker.color) {
          color = trace.marker.color;
        } else if (trace.line && trace.line.color) {
          color = trace.line.color;
        } else if (trace.fillcolor) {
          color = trace.fillcolor;
        } else {
          color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
        }

        const symbol = trace.marker && trace.marker.symbol ? trace.marker.symbol : 'circle';
        const isLine = typeof trace.mode === 'string' && trace.mode.includes('lines') && !trace.mode.includes('markers');
        const isLineAndMarker = typeof trace.mode === 'string' && trace.mode.includes('lines') && trace.mode.includes('markers');

        return {
          name: trace.name,
          color,
          symbol,
          isLine,
          isLineAndMarker,
          originalIndex: index,
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const uniqueLegendItems: typeof legendItems = [];
  const seenNames = new Set<string>();
  legendItems.forEach((item) => {
    if (!seenNames.has(item.name)) {
      seenNames.add(item.name);
      uniqueLegendItems.push(item);
    }
  });

  const hasVisibleLegend = layout.showlegend !== false && uniqueLegendItems.length > 0;

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      <div className="flex-1 min-h-0">
        <Plot
          data={finalData}
          layout={finalLayout}
          config={config}
          className={className}
          useResizeHandler={useResizeHandler}
          onClick={onClick}
          {...props}
        />
      </div>
      {hasVisibleLegend && (
        <div className="mt-3 px-4 py-2 bg-white border border-slate-200/85 rounded-lg shadow-2xs w-full">
          <div className="flex items-center gap-6 overflow-x-auto w-full py-1.5 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {uniqueLegendItems.map((item) => {
              const isHidden = !!hiddenTraces[item.name];
              return (
                <button
                  key={item.name}
                  onClick={() => toggleTrace(item.name)}
                  className={`flex items-center gap-2 shrink-0 select-none cursor-pointer hover:bg-slate-50 px-2 py-1 rounded transition-colors text-xs font-semibold ${
                    isHidden ? 'text-slate-400 line-through opacity-60' : 'text-slate-700'
                  }`}
                  title={`Click to show/hide ${item.name}`}
                >
                  {item.isLine ? (
                    <svg width="16" height="12" viewBox="0 0 16 12" className="inline-block shrink-0">
                      <line x1="1" y1="6" x2="15" y2="6" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  ) : item.isLineAndMarker ? (
                    <svg width="16" height="12" viewBox="0 0 16 12" className="inline-block shrink-0">
                      <line x1="1" y1="6" x2="15" y2="6" stroke={item.color} strokeWidth="1.5" />
                      <circle cx="8" cy="6" r="3.5" fill={item.color} />
                    </svg>
                  ) : (
                    <PlotlySymbol symbol={item.symbol} color={item.color} size={11} />
                  )}
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
