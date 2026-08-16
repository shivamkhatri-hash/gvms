import React from 'react';
import { CustomPlot as Plot } from './CustomPlot';
import { PetroleumSample } from '../../types';

interface PlotlyCorrelationMatrixProps {
  samples: PetroleumSample[];
}

export const PlotlyCorrelationMatrix: React.FC<PlotlyCorrelationMatrixProps> = ({ samples }) => {
  if (!samples || samples.length < 3) {
    return <div className="h-80 flex items-center justify-center text-slate-400 text-sm">Insufficient data points for correlation matrix.</div>;
  }

  // Calculate Pearson correlation coefficient matrix
  const depths = samples.map((s) => s.depth_from);
  const tocs = samples.map((s) => s.toc);
  const s2s = samples.map((s) => s.s2);
  const his = samples.map((s) => (s.toc > 0 ? (s.s2 / s.toc) * 100 : 0));

  const vars = [depths, tocs, s2s, his];
  const varNames = ['Depth (m)', 'TOC (wt%)', 'S2 (mg/g)', 'HI Proxy'];

  const calcCorrelation = (x: number[], y: number[]) => {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumX2 = x.reduce((a, b) => a + b * b, 0);
    const sumY2 = y.reduce((a, b) => a + b * b, 0);
    const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);

    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (den === 0) return 0;
    return parseFloat((num / den).toFixed(2));
  };

  const zValues = vars.map((v1) => vars.map((v2) => calcCorrelation(v1, v2)));

  const data: any[] = [
    {
      z: zValues,
      x: varNames,
      y: varNames,
      type: 'heatmap',
      colorscale: 'Blues',
      showscale: true,
      hoverongaps: false,
    },
  ];

  const layout: any = {
    title: {
      text: 'Geochemical Correlation Matrix (Pearson r)',
      font: { family: 'Inter, sans-serif', size: 14, color: '#0F172A' },
    },
    xaxis: {
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2
    },
    yaxis: {
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2
    },
    margin: { l: 80, r: 20, t: 50, b: 60 },
    autosize: true,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: '#FAFAFA',
  };

  return (
    <div className="w-full h-80">
      <Plot
        data={data}
        layout={layout}
        useResizeHandler={true}
        className="w-full h-full"
        config={{ displayModeBar: false, responsive: true }}
      />
    </div>
  );
};
