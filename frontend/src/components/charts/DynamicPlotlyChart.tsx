import React from 'react';
import { CustomPlot as Plot } from './CustomPlot';
import { applyGlobalLayoutDefaults, GLOBAL_PLOTLY_EXPORT_CONFIG } from '../../utils/plotlyConfig';

interface DataPoint {
  x: any;
  y?: any;
  z?: any;
  color_by?: string;
}

interface CorrelationData {
  labels: string[];
  z: number[][];
}

interface DynamicPlotlyChartProps {
  chartType: string;
  data: DataPoint[] | CorrelationData | any;
  xLabel: string;
  yLabel?: string;
  colorByLabel?: string;
  title: string;
  onPointClick?: (point: any) => void;
  height?: string;
}

export const DynamicPlotlyChart: React.FC<DynamicPlotlyChartProps> = ({
  chartType,
  data,
  xLabel,
  yLabel,
  colorByLabel,
  title,
  onPointClick,
  height = 'h-full',
}) => {
  let points = data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if ('data' in data && Array.isArray((data as any).data)) {
      points = (data as any).data;
    }
  }

  const isScientific = chartType === 's2_vs_toc' || chartType === 'hi_vs_tmax' || chartType === 'api_vs_depth' || chartType === 'pr_nc17_vs_ph_nc18';

  if (!isScientific && (!points || (Array.isArray(points) && points.length === 0))) {
    return (
      <div className="h-80 flex items-center justify-center text-slate-400 text-sm">
        No coordinate data found for this visualization request.
      </div>
    );
  }



  // 1. Handle Correlation Matrix (Heatmap)
  if (chartType === 'correlation_matrix') {
    const corr = data as CorrelationData;
    if (!corr.labels || corr.labels.length === 0) {
      return (
        <div className="h-80 flex items-center justify-center text-slate-400 text-sm">
          No numeric variables available for correlation.
        </div>
      );
    }

    const plotData: any[] = [
      {
        z: corr.z,
        x: corr.labels,
        y: corr.labels,
        type: 'heatmap',
        colorscale: 'RdBu',
        reversescale: true,
        zmin: -1,
        zmax: 1,
        hoverongaps: false,
        text: corr.z.map((row) => row.map((val) => `Correlation: ${val.toFixed(3)}`)),
        hoverinfo: 'x+y+text',
      },
    ];

    const layout = applyGlobalLayoutDefaults({
      title: {
        text: title,
        font: { family: 'Inter, sans-serif', size: 16, color: '#0F172A', bold: true },
      },
      margin: { l: 120, r: 20, t: 80, b: 120 },
      autosize: true,
      paper_bgcolor: '#FFFFFF',
      plot_bgcolor: '#FAFAFA',
    });

    return (
      <div className="w-full h-[620px] bg-white border border-slate-200 rounded-lg flex flex-col overflow-hidden shadow-none">
        {title && (
          <div className="border-b border-slate-100 p-5 pb-3">
            <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
              <h4 className="text-sm font-bold text-slate-800">{title}</h4>
            </div>
          </div>
        )}
        <div className="flex-1 p-5 min-h-0">
          <Plot
            data={plotData}
            layout={{ ...layout, title: undefined }}
            useResizeHandler={true}
            className="w-full h-full"
            config={{
              ...GLOBAL_PLOTLY_EXPORT_CONFIG,
              modeBarButtonsToRemove: [
                'select2d',
                'lasso2d',
                'zoomIn2d',
                'zoomOut2d',
                'autoScale2d',
                'toggleSpikelines',
                'hoverCompareCartesian',
                'hoverClosestCartesian'
              ]
            }}
          />
        </div>
      </div>
    );
  }

  // 2. Prepare Coordinate Series
  const pointsArray = (points || []) as DataPoint[];
  const traces: any[] = [];

  // Count frequencies of each color_by value to determine if we exceed group limits
  const freq: Record<string, number> = {};
  let hasGroups = false;
  pointsArray.forEach((pt) => {
    if (pt.color_by) {
      const g = String(pt.color_by);
      freq[g] = (freq[g] || 0) + 1;
      hasGroups = true;
    }
  });

  // If unique group names exceed 50, we disable grouping and treat all points as a single uniform series (no legend)
  const uniqueGroups = Object.keys(freq);
  if (uniqueGroups.length > 50) {
    hasGroups = false;
  }

  // Helper to group data by 'color_by' attribute
  const groups: Record<string, DataPoint[]> = {};

  pointsArray.forEach((pt) => {
    if (hasGroups && pt.color_by) {
      const g = String(pt.color_by);
      if (!groups[g]) groups[g] = [];
      groups[g].push(pt);
    } else {
      if (!groups['Data']) groups['Data'] = [];
      groups['Data'].push(pt);
    }
  });

  // Construct Trace for each group
  Object.entries(groups).forEach(([groupName, groupPoints]) => {
    const xVals = groupPoints.map((p) => p.x);
    const yVals = groupPoints.map((p) => p.y);
    const zVals = groupPoints.map((p) => p.z);

    let trace: any = {
      x: xVals,
      name: hasGroups ? groupName : title,
      showlegend: hasGroups,
      customdata: groupPoints,
    };

    if (yLabel && chartType !== 'horizontal_bar' && chartType !== 'pie' && chartType !== 'treemap' && chartType !== 'sunburst' && chartType !== 'contour') {
      trace.y = yVals;
    }

    // Set trace config based on chartType
    if (chartType === 'scatter' || chartType === 'depth_profile' || chartType === 's2_vs_toc' || chartType === 'hi_vs_tmax' || chartType === 'api_vs_depth' || chartType === 'pr_nc17_vs_ph_nc18') {
      trace.type = 'scatter';
      trace.mode = 'markers';

      // Define standard palette and symbols for explicit mapping
      const colors = [
        '#3b82f6', '#ef4444', '#10b981', '#8b5cf6', '#f59e0b',
        '#ec4899', '#22c55e', '#6366f1', '#84cc16', '#14b8a6',
        '#d97706', '#4f46e5'
      ];
      const symbols = ['circle', 'triangle-up', 'triangle-down', 'diamond', 'square', 'cross'];

      // Find index of current group key to assign stable colors/symbols
      const groupKeys = Object.keys(groups);
      const groupIdx = groupKeys.indexOf(groupName);

      let color = colors[groupIdx % colors.length];
      let symbol = symbols[groupIdx % symbols.length];
      let size = 10;

      if (chartType === 'pr_nc17_vs_ph_nc18') {
        const nameUpper = groupName.toUpperCase();
        symbol = 'circle';
        color = '#3b82f6';
        size = 10;
        
        if (nameUpper === 'A' || nameUpper.includes('WELL A') || nameUpper === 'WELL_A') {
          symbol = 'diamond';
          color = '#0284c7';
        } else if (nameUpper === 'B' || nameUpper.includes('WELL B') || nameUpper === 'WELL_B') {
          symbol = 'square';
          color = '#ec4899';
        } else if (nameUpper === 'C' || nameUpper.includes('WELL C') || nameUpper === 'WELL_C') {
          symbol = 'circle';
          color = '#dc2626';
        } else if (nameUpper === 'D' || nameUpper.includes('WELL D') || nameUpper === 'WELL_D') {
          symbol = 'triangle-up';
          color = '#16a34a';
        } else if (nameUpper === 'E' || nameUpper.includes('WELL E') || nameUpper === 'WELL_E') {
          symbol = 'plus';
          color = '#ea580c';
          size = 12;
        } else if (nameUpper === 'F' || nameUpper.includes('WELL F') || nameUpper === 'WELL_F') {
          symbol = 'asterisk';
          color = '#d946ef';
          size = 12;
        } else if (nameUpper === 'G' || nameUpper.includes('WELL G') || nameUpper === 'WELL_G') {
          symbol = 'x';
          color = '#10b981';
        } else if (nameUpper === 'H' || nameUpper.includes('WELL H') || nameUpper === 'WELL_H') {
          symbol = 'line-ew';
          color = '#8b5cf6';
          size = 14;
        } else {
          const hash = nameUpper.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const prphColors = ['#0891b2', '#0d9488', '#4f46e5', '#7c3aed', '#db2777', '#ca8a04'];
          const prphSymbols = ['circle', 'triangle-up', 'triangle-down', 'diamond', 'square', 'cross'];
          color = prphColors[hash % prphColors.length];
          symbol = prphSymbols[hash % prphSymbols.length];
        }
      }

      // Explicitly assign trace marker attributes so they are rendered properly and match the legend!
      trace.marker = {
        symbol: symbol,
        color: color,
        size: size,
        opacity: 0.9,
        line: {
          color: symbol === 'asterisk' || symbol === 'line-ew' || symbol === 'plus' ? color : '#000000',
          width: symbol === 'asterisk' || symbol === 'line-ew' || symbol === 'plus' ? 0 : 0.8
        }
      };
      
      if (chartType === 's2_vs_toc') {
        trace.text = groupPoints.map(
          (p: any) =>
            `Sample Type: ${p.sample_type || 'N/A'}<br>` +
            `Formation: ${p.formation || 'N/A'}<br>` +
            `Depth: ${p.top_depth !== undefined && p.top_depth !== null ? p.top_depth : 'N/A'}<br>` +
            `Range: ${p.sample_id || 'N/A'}<br>` +
            `TOC: ${p.x} %<br>` +
            `S2: ${p.y} mg HC/g rock`
        );
        trace.hoverinfo = 'text';
      } else if (chartType === 'hi_vs_tmax') {
        trace.text = groupPoints.map((p: any) => {
          let lines = [
            `Sample Type: ${p.sample_type || 'N/A'}`,
            `Tmax: ${p.x} °C`,
            `HI: ${p.y} mg HC/g TOC`,
            `depth: ${p.top_depth !== undefined && p.top_depth !== null ? p.top_depth : 'N/A'}`,
            `Formation: ${p.formation || 'N/A'}`
          ];

          // Add remaining fields dynamically from the source row
          const standardKeys = [
            'x', 'y', 'chart_id', 'color_by', 'sample_type', 'formation', 'top_depth', 'sample_id',
            'lithology', 'layer_name', 'tmax', 'hi', 'borehole_name', 'well_name', 'well', 'depth', 'id', 'ubhi'
          ];

          Object.keys(p).forEach((key) => {
            if (!standardKeys.includes(key) && p[key] !== undefined && p[key] !== null && String(p[key]).trim() !== '') {
              const dispKey = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              lines.push(`${dispKey}: ${p[key]}`);
            }
          });

          return lines.join('<br>');
        });
        trace.hoverinfo = 'text';
      } else if (chartType === 'api_vs_depth') {
        trace.text = groupPoints.map((p: any) => {
          let lines = [
            `Well No.: ${p.well_name || 'N/A'}`,
            `Object: ${p.object_number || 'N/A'}`,
            `Depth: ${p.y} m`,
            `API Gravity: ${p.x} °API`
          ];

          const standardKeys = [
            'x', 'y', 'z', 'color_by', 'chart_id', 'well_name', 'object_number', 'interval_top', 'api_gravity', 'id', 'borehole_id', 'uploaded_by'
          ];

          Object.keys(p).forEach((key) => {
            if (!standardKeys.includes(key) && p[key] !== undefined && p[key] !== null && String(p[key]).trim() !== '') {
              const dispKey = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              lines.push(`${dispKey}: ${p[key]}`);
            }
          });

          return lines.join('<br>');
        });
        trace.hoverinfo = 'text';
      } else if (chartType === 'pr_nc17_vs_ph_nc18') {
        trace.text = groupPoints.map((p: any) => {
          let lines = [
            `Well No.: ${p.name || 'N/A'}`,
            `Obj: ${p.object_number || 'N/A'}`,
            `Formation: ${p.formation || 'N/A'}`,
            `Pr/Ph: ${p.pr_by_ph !== undefined && p.pr_by_ph !== null ? p.pr_by_ph : 'N/A'}`,
            `Pr/nC17: ${p.y !== undefined && p.y !== null ? p.y : 'N/A'}`,
            `Ph/nC18: ${p.x !== undefined && p.x !== null ? p.x : 'N/A'}`
          ];

          const standardKeys = [
            'x', 'y', 'z', 'color_by', 'chart_id', 'name', 'object_number', 'formation', 'pr_by_ph', 'pr_by_nc17', 'ph_by_nc18', 'id', 'borehole_id', 'uploaded_by'
          ];

          Object.keys(p).forEach((key) => {
            if (!standardKeys.includes(key) && p[key] !== undefined && p[key] !== null && String(p[key]).trim() !== '') {
              const dispKey = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              lines.push(`${dispKey}: ${p[key]}`);
            }
          });

          return lines.join('<br>');
        });
        trace.hoverinfo = 'text';
      }
    } else if (chartType === '3d_scatter') {
      trace.type = 'scatter3d';
      trace.mode = 'markers';
      trace.z = zVals;
      trace.marker = { size: 6, opacity: 0.8 };
    } else if (chartType === 'line') {
      trace.type = 'scatter';
      trace.mode = 'lines+markers';
      trace.line = { shape: 'linear', width: 2 };
      trace.marker = { size: 6 };
    } else if (chartType === 'bar') {
      trace.type = 'bar';
    } else if (chartType === 'horizontal_bar') {
      trace.type = 'bar';
      trace.orientation = 'h';
      trace.x = yVals;
      trace.y = xVals;
    } else if (chartType === 'histogram') {
      trace.type = 'histogram';
      trace.nbinsx = 20;
    } else if (chartType === 'boxplot') {
      trace.type = 'box';
      trace.name = groupName;
      trace.y = yVals.length > 0 && yVals[0] !== undefined ? yVals : xVals;
      trace.x = yVals.length > 0 && yVals[0] !== undefined ? xVals : undefined;
    } else if (chartType === 'violin') {
      trace.type = 'violin';
      trace.y = yVals.length > 0 && yVals[0] !== undefined ? yVals : xVals;
      trace.x = yVals.length > 0 && yVals[0] !== undefined ? xVals : undefined;
      trace.box = { visible: true };
      trace.meanline = { visible: true };
    } else if (chartType === 'bubble') {
      trace.type = 'scatter';
      trace.mode = 'markers';
      trace.marker = {
        size: yVals.map((y) => (typeof y === 'number' ? Math.min(Math.max(y * 2, 6), 24) : 10)),
        opacity: 0.7,
      };
    } else if (chartType === 'area') {
      trace.type = 'scatter';
      trace.mode = 'lines';
      trace.fill = 'tozeroy';
    } else if (chartType === 'pie') {
      trace.type = 'pie';
      trace.labels = xVals;
      trace.values = yVals.length > 0 ? yVals : undefined;
    } else if (chartType === 'treemap') {
      trace.type = 'treemap';
      trace.labels = xVals;
      trace.parents = yVals.length > 0 ? yVals : xVals.map(() => '');
    } else if (chartType === 'sunburst') {
      trace.type = 'sunburst';
      trace.labels = xVals;
      trace.parents = yVals.length > 0 ? yVals : xVals.map(() => '');
    } else if (chartType === 'contour') {
      trace.type = 'contour';
      trace.z = yVals.length > 0 ? yVals : xVals;
    } else {
      trace.type = 'scatter';
      trace.mode = 'markers';
    }

    traces.push(trace);
  });

  if (chartType === 'hi_vs_tmax') {
    const generateCurveTrace = (name: string, color: string, points: [number, number][]) => ({
      x: points.map(p => p[0]),
      y: points.map(p => p[1]),
      type: 'scatter' as const,
      mode: 'lines' as const,
      line: { color: color, width: 2, shape: 'spline' as const, smoothing: 1.3 },
      name: name,
      showlegend: false,
      hoverinfo: 'name' as const,
    });

    const typeIII = generateCurveTrace('Type III', '#F97316', [
      [400, 85], [410, 85], [420, 80], [425, 80], [430, 75], [435, 75], [440, 70], [445, 65], [450, 60], [455, 50], [460, 40], [465, 30], [470, 20], [472, 15]
    ]);
    const typeII20 = generateCurveTrace('Type II 20%', '#94A3B8', [
      [400, 190], [410, 190], [420, 185], [425, 180], [430, 175], [435, 170], [440, 160], [445, 145], [450, 125], [455, 105], [460, 80], [465, 55], [470, 35], [472, 20]
    ]);
    const typeII40 = generateCurveTrace('Type II 40%', '#EAB308', [
      [400, 325], [410, 325], [420, 315], [425, 310], [430, 300], [435, 290], [440, 270], [445, 240], [450, 200], [455, 155], [460, 110], [465, 75], [470, 45], [472, 30]
    ]);
    const typeII60 = generateCurveTrace('Type II 60%', '#0EA5E9', [
      [400, 425], [410, 425], [420, 415], [425, 405], [430, 395], [435, 380], [440, 350], [445, 310], [450, 255], [455, 195], [460, 130], [465, 85], [470, 55], [472, 40]
    ]);
    const typeII80 = generateCurveTrace('Type II 80%', '#2563EB', [
      [400, 525], [410, 525], [420, 515], [425, 505], [430, 490], [435, 470], [440, 435], [445, 385], [450, 315], [455, 240], [460, 160], [465, 100], [470, 65], [472, 50]
    ]);
    const typeII = generateCurveTrace('Type II', '#1E3A8A', [
      [400, 630], [410, 630], [420, 620], [425, 610], [430, 595], [435, 570], [440, 530], [445, 470], [450, 385], [455, 290], [460, 195], [465, 120], [470, 75], [472, 60]
    ]);

    traces.unshift(typeII, typeII80, typeII60, typeII40, typeII20, typeIII);
  }

  // 3. Configure layout
  const layout: any = applyGlobalLayoutDefaults({
    title: {
      text: title,
      font: { family: 'Inter, sans-serif', size: 16, color: '#0F172A', bold: true },
    },
    xaxis: {
      title: {
        text: xLabel,
        font: { family: 'Inter, sans-serif', size: 13, color: '#475569', bold: true }
      },
      gridcolor: '#F1F5F9',
      zerolinecolor: '#000000',
      rangemode: 'tozero',
    },
    yaxis: {
      title: {
        text: yLabel || 'Count',
        font: { family: 'Inter, sans-serif', size: 13, color: '#475569', bold: true }
      },
      gridcolor: '#F1F5F9',
      zerolinecolor: '#000000',
      rangemode: 'tozero',
    },
    margin: { l: 80, r: 30, t: 80, b: 80 },
    autosize: true,
    hovermode: 'closest',
    legend: {
      orientation: 'h',
      y: -0.15,
      xanchor: 'center',
      x: 0.5,
      font: { family: 'Inter, sans-serif', size: 11, color: '#475569' }
    },
    paper_bgcolor: '#FFFFFF',
    plot_bgcolor: '#FAFAFA',
  });

  // 3D Scene Config
  if (chartType === '3d_scatter') {
    layout.scene = {
      xaxis: { title: xLabel },
      yaxis: { title: yLabel || 'Y Axis' },
      zaxis: { title: 'Z Axis' },
    };
  }

  // Scientific inverted autorange for dynamic subsurface logs
  if (chartType === 'depth_profile' && yLabel) {
    layout.yaxis.autorange = 'reversed';
  }

  if (chartType === 's2_vs_toc') {
    layout.paper_bgcolor = '#FFFFFF';
    layout.plot_bgcolor = '#FFFFFF';
    layout.margin = { l: 50, r: 25, t: 25, b: 50 };

    layout.xaxis.showline = true;
    layout.xaxis.mirror = true;
    layout.xaxis.linecolor = '#000000';
    layout.xaxis.linewidth = 2.5;

    layout.yaxis.showline = true;
    layout.yaxis.mirror = true;
    layout.yaxis.linecolor = '#000000';
    layout.yaxis.linewidth = 2.5;

    layout.yaxis.scaleanchor = 'x';
    layout.yaxis.scaleratio = 1;

    layout.xaxis.type = 'log';
    layout.xaxis.range = [Math.log10(0.1), Math.log10(100)];
    layout.xaxis.dtick = 1;
    layout.xaxis.tickvals = [0.1, 0.5, 1.0, 2.0, 4.0, 10.0, 100.0];
    layout.xaxis.ticktext = ['0.1', '0.5', '1.0', '2.0', '4.0', '10.0', '100.0'];
    delete layout.xaxis.rangemode;

    layout.yaxis.type = 'log';
    layout.yaxis.range = [Math.log10(0.1), Math.log10(100)];
    layout.yaxis.dtick = 1;
    layout.yaxis.tickvals = [0.1, 2.5, 5.0, 10.0, 20.0, 100.0];
    layout.yaxis.ticktext = ['0.1', '2.5', '5.0', '10.0', '20.0', '100.0'];
    delete layout.yaxis.rangemode;

    layout.shapes = [
      // TOC Vertical Lines
      { type: 'line', xref: 'x', yref: 'paper', x0: 0.5, x1: 0.5, y0: 0, y1: 1, line: { color: '#06B6D4', width: 1.5, dash: 'dash' } },
      { type: 'line', xref: 'x', yref: 'paper', x0: 1.0, x1: 1.0, y0: 0, y1: 1, line: { color: '#F97316', width: 1.5, dash: 'dash' } },
      { type: 'line', xref: 'x', yref: 'paper', x0: 2.0, x1: 2.0, y0: 0, y1: 1, line: { color: '#2563EB', width: 1.5, dash: 'dash' } },
      { type: 'line', xref: 'x', yref: 'paper', x0: 4.0, x1: 4.0, y0: 0, y1: 1, line: { color: '#EF4444', width: 1.5, dash: 'dash' } },

      // S2 Horizontal Lines
      { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 2.5, y1: 2.5, line: { color: '#2563EB', width: 1.5, dash: 'dash' } },
      { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 5.0, y1: 5.0, line: { color: '#EF4444', width: 1.5, dash: 'dash' } },
      { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 10.0, y1: 10.0, line: { color: '#16A34A', width: 1.5, dash: 'dash' } },
      { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 20.0, y1: 20.0, line: { color: '#7C3AED', width: 1.5, dash: 'dash' } },
    ];

    layout.annotations = [
      // TOC Labels (vertical column regions, placed at y = 40.0 near the upper portion of the graph)
      { xref: 'x', yref: 'y', x: Math.log10(Math.sqrt(0.1 * 0.5)), y: Math.log10(40.0), text: '<b>POOR</b>', showarrow: false, textangle: -90, font: { color: '#000000', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: Math.log10(Math.sqrt(0.5 * 1.0)), y: Math.log10(40.0), text: '<b>FAIR</b>', showarrow: false, textangle: -90, font: { color: '#000000', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: Math.log10(Math.sqrt(1.0 * 2.0)), y: Math.log10(40.0), text: '<b>GOOD</b>', showarrow: false, textangle: -90, font: { color: '#000000', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: Math.log10(Math.sqrt(2.0 * 4.0)), y: Math.log10(40.0), text: '<b>VERY GOOD</b>', showarrow: false, textangle: -90, font: { color: '#000000', size: 9, family: 'Inter, sans-serif' } },

      // S2 Labels (horizontal regions, placed at x = 80.0 towards the right side of the graph)
      { xref: 'x', yref: 'y', x: Math.log10(80.0), y: Math.log10(Math.sqrt(0.1 * 2.5)), text: '<b>POOR</b>', showarrow: false, xanchor: 'right', font: { color: '#000000', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: Math.log10(80.0), y: Math.log10(Math.sqrt(2.5 * 5.0)), text: '<b>FAIR</b>', showarrow: false, xanchor: 'right', font: { color: '#000000', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: Math.log10(80.0), y: Math.log10(Math.sqrt(5.0 * 10.0)), text: '<b>GOOD</b>', showarrow: false, xanchor: 'right', font: { color: '#000000', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: Math.log10(80.0), y: Math.log10(Math.sqrt(10.0 * 20.0)), text: '<b>VERY GOOD</b>', showarrow: false, xanchor: 'right', font: { color: '#000000', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: Math.log10(80.0), y: Math.log10(Math.sqrt(20.0 * 100.0)), text: '<b>EXCELLENT</b>', showarrow: false, xanchor: 'right', font: { color: '#000000', size: 9, family: 'Inter, sans-serif' } },
    ];
  }

  // Specialized layout config for HI vs Tmax plot
  if (chartType === 'hi_vs_tmax') {
    layout.paper_bgcolor = '#FFFFFF';
    layout.plot_bgcolor = '#FFFFFF';
    layout.margin = { l: 50, r: 25, t: 25, b: 50 };

    layout.xaxis.showline = true;
    layout.xaxis.mirror = true;
    layout.xaxis.linecolor = '#000000';
    layout.xaxis.linewidth = 2.5;

    layout.yaxis.showline = true;
    layout.yaxis.mirror = true;
    layout.yaxis.linecolor = '#000000';
    layout.yaxis.linewidth = 2.5;

    layout.yaxis.scaleanchor = 'x';
    layout.yaxis.scaleratio = 0.087912;

    // X-axis limits: 400 to 500 °C
    layout.xaxis.range = [400, 500];
    layout.xaxis.tickvals = [400, 410, 420, 430, 440, 450, 460, 470, 480, 490, 500];
    layout.xaxis.ticktext = ['400', '410', '420', '430', '440', '450', '460', '470', '480', '490', '500'];
    delete layout.xaxis.rangemode;

    // Y-axis limits: 0 to 700
    layout.yaxis.range = [0, 700];
    layout.yaxis.tickvals = [0, 100, 200, 300, 400, 500, 600, 700];
    layout.yaxis.ticktext = ['0', '100', '200', '300', '400', '500', '600', '700'];
    delete layout.yaxis.rangemode;

    layout.shapes = [
      // Maturity vertical reference lines
      { type: 'line', xref: 'x', yref: 'y', x0: 435, x1: 435, y0: 0, y1: 700, line: { color: '#000000', width: 1.2 } },
      { type: 'line', xref: 'x', yref: 'y', x0: 470, x1: 470, y0: 0, y1: 700, line: { color: '#000000', width: 1.2 } },
    ];

    layout.annotations = [
      // Maturity Labels (black bold horizontal labels near the top-middle)
      { xref: 'x', yref: 'y', x: 435, y: 605, text: '<b>%Ro = 0.60</b>', showarrow: false, yanchor: 'bottom', xanchor: 'center', font: { color: '#000000', size: 10, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: 470, y: 605, text: '<b>%Ro = 1.35</b>', showarrow: false, yanchor: 'bottom', xanchor: 'center', font: { color: '#000000', size: 10, family: 'Inter, sans-serif' } },

      // Coaly/Carbonaceous sediments
      { xref: 'x', yref: 'y', x: 433, y: 375, text: '<b>Coaly/Carbonaceous<br>sediments</b>', showarrow: false, font: { color: '#475569', size: 9, family: 'Inter, sans-serif' } },

      // Kerogen Type labels (spaced and positioned near the flat portion of the curves)
      { xref: 'x', yref: 'y', x: 402, y: 635, text: '<b>Type-II</b>', showarrow: false, xanchor: 'left', font: { color: '#1E3A8A', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: 402, y: 530, text: '<b>Type-II 80%</b>', showarrow: false, xanchor: 'left', font: { color: '#2563EB', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: 402, y: 430, text: '<b>Type-II 60%</b>', showarrow: false, xanchor: 'left', font: { color: '#0EA5E9', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: 402, y: 330, text: '<b>Type-II 40%</b>', showarrow: false, xanchor: 'left', font: { color: '#EAB308', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: 402, y: 195, text: '<b>Type-II 20%</b>', showarrow: false, xanchor: 'left', font: { color: '#94A3B8', size: 9, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: 402, y: 90, text: '<b>Type-III</b>', showarrow: false, xanchor: 'left', font: { color: '#F97316', size: 9, family: 'Inter, sans-serif' } },
    ];
  }

  // Specialized layout config for API Gravity vs Depth plot
  if (chartType === 'api_vs_depth') {
    layout.paper_bgcolor = '#FFFFFF';
    layout.plot_bgcolor = '#FFFFFF';

    layout.xaxis.showline = true;
    layout.xaxis.mirror = true;
    layout.xaxis.linecolor = '#000000';
    layout.xaxis.linewidth = 2.5;

    layout.yaxis.showline = true;
    layout.yaxis.mirror = true;
    layout.yaxis.linecolor = '#000000';
    layout.yaxis.linewidth = 2.5;

    // X-axis limits: 10 to 70 °API
    layout.xaxis.range = [10, 70];
    layout.xaxis.tickvals = [10, 20, 30, 40, 50, 60, 70];
    layout.xaxis.ticktext = ['10', '20', '30', '40', '50', '60', '70'];
    delete layout.xaxis.rangemode;

    // Y-axis limits: 1000 to 4000 m (reversed)
    layout.yaxis.range = [4000, 1000];
    layout.yaxis.tickvals = [1000, 1500, 2000, 2500, 3000, 3500, 4000];
    layout.yaxis.ticktext = ['1000', '1500', '2000', '2500', '3000', '3500', '4000'];
    delete layout.yaxis.rangemode;

    layout.shapes = [
      // Classification vertical reference lines
      { type: 'line', xref: 'x', yref: 'y', x0: 30, x1: 30, y0: 1000, y1: 4000, line: { color: '#000000', width: 1.2, dash: 'dash' } },
      { type: 'line', xref: 'x', yref: 'y', x0: 40, x1: 40, y0: 1000, y1: 4000, line: { color: '#000000', width: 1.2, dash: 'dash' } },
      { type: 'line', xref: 'x', yref: 'y', x0: 60, x1: 60, y0: 1000, y1: 4000, line: { color: '#000000', width: 1.2, dash: 'dash' } },
    ];

    layout.annotations = [
      // Classification labels (bold black text)
      { xref: 'x', yref: 'y', x: 20, y: 1200, text: '<b>Heavy oils</b>', showarrow: false, xanchor: 'center', font: { color: '#000000', size: 10, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: 35, y: 1200, text: '<b>Medium oils</b>', showarrow: false, xanchor: 'center', font: { color: '#000000', size: 10, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: 50, y: 1200, text: '<b>Light oils</b>', showarrow: false, xanchor: 'center', font: { color: '#000000', size: 10, family: 'Inter, sans-serif' } },
      { xref: 'x', yref: 'y', x: 65, y: 1200, text: '<b>Condensates /<br>very light oils</b>', showarrow: false, xanchor: 'center', font: { color: '#000000', size: 10, family: 'Inter, sans-serif' } },
    ];
  }

  // Specialized layout config for Pristane/nC17 vs Phytane/nC18 plot
  if (chartType === 'pr_nc17_vs_ph_nc18') {
    const log10 = Math.log10;
    
    layout.paper_bgcolor = '#FFFFFF';
    layout.plot_bgcolor = '#FFFFFF';
    layout.showlegend = true; // Show legend below plot
    layout.margin = { l: 80, r: 80, t: 50, b: 80 }; // Compact margins to maximize plot size

    layout.xaxis.showline = true;
    layout.xaxis.mirror = true;
    layout.xaxis.linecolor = '#000000';
    layout.xaxis.linewidth = 2.5;
    layout.xaxis.showgrid = false; // Match reference (no grids)

    layout.yaxis.showline = true;
    layout.yaxis.mirror = true;
    layout.yaxis.linecolor = '#000000';
    layout.yaxis.linewidth = 2.5;
    layout.yaxis.showgrid = false; // Match reference (no grids)

    // Logarithmic axes
    layout.xaxis.type = 'log';
    layout.yaxis.type = 'log';

    layout.xaxis.range = [-2, 1];
    layout.xaxis.tickvals = [0.01, 0.1, 1, 10];
    layout.xaxis.ticktext = ['0.01', '0.1', '1.0', '10.0'];
    layout.xaxis.constrain = 'domain';
    delete layout.xaxis.rangemode;

    layout.yaxis.range = [-2, 1];
    layout.yaxis.tickvals = [0.01, 0.1, 1, 10];
    layout.yaxis.ticktext = ['0.01', '0.10', '1.00', '10.00'];
    delete layout.yaxis.rangemode;

    // Force perfect square aspect ratio so diagonal lines/labels align at exactly 45 degrees
    layout.yaxis.scaleanchor = 'x';
    layout.yaxis.scaleratio = 1.0;
    layout.yaxis.constrain = 'domain';

    layout.xaxis.title = {
      text: '<b>Phytane / nC<sub>18</sub></b>',
      font: { color: '#000000', size: 12, family: 'Inter, sans-serif' }
    };
    layout.yaxis.title = {
      text: '<b>Pristane / nC<sub>17</sub></b>',
      font: { color: '#000000', size: 12, family: 'Inter, sans-serif' }
    };
    layout.xaxis.tickfont = { color: '#000000', size: 10, family: 'Inter, sans-serif' };
    layout.yaxis.tickfont = { color: '#000000', size: 10, family: 'Inter, sans-serif' };

    layout.shapes = [
      // Diagonal constant ratio solid lines (slope = 1 on log-log represents constant y = C * x)
      { type: 'line', xref: 'x', yref: 'y', x0: 0.01, x1: 1.25, y0: 0.08, y1: 10.0, line: { color: '#000000', width: 1.0 } }, // Pr/Ph = 8
      { type: 'line', xref: 'x', yref: 'y', x0: 0.01, x1: 2.50, y0: 0.04, y1: 10.0, line: { color: '#000000', width: 1.0 } }, // Pr/Ph = 4
      { type: 'line', xref: 'x', yref: 'y', x0: 0.01, x1: 5.00, y0: 0.02, y1: 10.0, line: { color: '#000000', width: 1.0 } }, // Pr/Ph = 2
      { type: 'line', xref: 'x', yref: 'y', x0: 0.01, x1: 10.0, y0: 0.01, y1: 10.0, line: { color: '#000000', width: 1.0 } }, // Pr/Ph = 1
      { type: 'line', xref: 'x', yref: 'y', x0: 0.02, x1: 10.0, y0: 0.01, y1: 5.00, line: { color: '#000000', width: 1.0 } }, // Pr/Ph = 0.5
    ];

    layout.annotations = [
      // Classification zone text labels parallel to the diagonals (textangle: -45)
      {
        xref: 'x', yref: 'y',
        x: log10(0.80), y: log10(6.4),
        text: '<b>Terrestrial,<br>Type III</b>',
        showarrow: false,
        textangle: -45,
        font: { color: '#000000', size: 10, family: 'Inter, sans-serif' }
      },
      {
        xref: 'x', yref: 'y',
        x: log10(1.20), y: log10(4.8),
        text: '<b>Terrestrial,<br>CoalyType III</b>',
        showarrow: false,
        textangle: -45,
        font: { color: '#000000', size: 10, family: 'Inter, sans-serif' }
      },
      {
        xref: 'x', yref: 'y',
        x: log10(1.50), y: log10(3.0),
        text: '<b>Type II-Type III<br>mixture</b>',
        showarrow: false,
        textangle: -45,
        font: { color: '#000000', size: 10, family: 'Inter, sans-serif' }
      },
      {
        xref: 'x', yref: 'y',
        x: log10(2.20), y: log10(2.2),
        text: '<b>Type II, reducing<br>algal, marine</b>',
        showarrow: false,
        textangle: -45,
        font: { color: '#000000', size: 10, family: 'Inter, sans-serif' }
      },

      // Directions/arrows annotations in black on log-log grid coordinates
      // Biodegradation Arrow (pointing up-right above data points)
      {
        xref: 'x', yref: 'y',
        x: log10(0.20), y: log10(1.8),
        axref: 'x', ayref: 'y',
        ax: log10(0.08), ay: log10(0.7),
        showarrow: true,
        arrowhead: 2, arrowsize: 1.2, arrowwidth: 1.5, arrowcolor: '#000000',
        text: ''
      },
      {
        xref: 'x', yref: 'y',
        x: log10(0.125), y: log10(1.2),
        text: '<b>Biodegradation</b>',
        showarrow: false,
        textangle: -45,
        font: { color: '#000000', size: 11, family: 'Inter, sans-serif' }
      },

      // Maturation Arrow (pointing down-left below data points)
      {
        xref: 'x', yref: 'y',
        x: log10(0.09), y: log10(0.03),
        axref: 'x', ayref: 'y',
        ax: log10(0.22), ay: log10(0.07),
        showarrow: true,
        arrowhead: 2, arrowsize: 1.2, arrowwidth: 1.5, arrowcolor: '#000000',
        text: ''
      },
      {
        xref: 'x', yref: 'y',
        x: log10(0.16), y: log10(0.05),
        text: '<b>Maturation</b>',
        showarrow: false,
        textangle: -45,
        font: { color: '#000000', size: 11, family: 'Inter, sans-serif' }
      },

      // Oxidizing / Reducing arrows pointing outward from center
      // Oxidizing Arrow pointing up-left
      {
        xref: 'x', yref: 'y',
        x: log10(0.52), y: log10(0.85),
        axref: 'x', ayref: 'y',
        ax: log10(0.62), ay: log10(0.62),
        showarrow: true,
        arrowhead: 2, arrowsize: 1.2, arrowwidth: 1.5, arrowcolor: '#000000',
        text: ''
      },
      {
        xref: 'x', yref: 'y',
        x: log10(0.55), y: log10(0.92),
        text: '<b>Oxidizing</b>',
        showarrow: false,
        textangle: 45,
        font: { color: '#000000', size: 10, family: 'Inter, sans-serif' }
      },

      // Reducing Arrow pointing down-right
      {
        xref: 'x', yref: 'y',
        x: log10(0.75), y: log10(0.45),
        axref: 'x', ayref: 'y',
        ax: log10(0.62), ay: log10(0.62),
        showarrow: true,
        arrowhead: 2, arrowsize: 1.2, arrowwidth: 1.5, arrowcolor: '#000000',
        text: ''
      },
      {
        xref: 'x', yref: 'y',
        x: log10(0.70), y: log10(0.38),
        text: '<b>Reducing</b>',
        showarrow: false,
        textangle: 45,
        font: { color: '#000000', size: 10, family: 'Inter, sans-serif' }
      }
    ];
  }

  const isSR = chartType === 's2_vs_toc' || chartType === 'hi_vs_tmax';
  const containerClasses = isSR
    ? `w-full ${height} flex flex-col overflow-hidden`
    : `w-full ${height} bg-white border border-slate-200 rounded-lg flex flex-col overflow-hidden shadow-none`;
  const bodyClasses = `flex-1 ${isSR ? 'p-0' : 'p-5'} min-h-0`;

  return (
    <div className={containerClasses}>
      {title && (
        <div className="border-b border-slate-100 p-5 pb-3">
          <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
            <h4 className="text-sm font-bold text-slate-800">{title}</h4>
          </div>
        </div>
      )}
      <div className={bodyClasses}>
        <Plot
          data={traces}
          layout={{ ...layout, title: undefined }}
          useResizeHandler={true}
          className="w-full h-full"
          onClick={(data) => {
            if (data.points && data.points.length > 0) {
              const pointInfo = data.points[0].customdata;
              if (pointInfo && onPointClick) {
                onPointClick(pointInfo);
              }
            }
          }}
          config={{
            ...GLOBAL_PLOTLY_EXPORT_CONFIG,
            modeBarButtonsToRemove: [
              'select2d',
              'lasso2d',
              'zoomIn2d',
              'zoomOut2d',
              'autoScale2d',
              'toggleSpikelines',
              'hoverCompareCartesian',
              'hoverClosestCartesian'
            ]
          }}
        />
      </div>
    </div>
  );
};
