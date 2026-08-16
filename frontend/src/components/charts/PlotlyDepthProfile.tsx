import React from 'react';
import { CustomPlot as Plot } from './CustomPlot';
import { PetroleumSample } from '../../types';

interface PlotlyDepthProfileProps {
  samples: PetroleumSample[];
  metric: 'toc' | 's2';
}

export const PlotlyDepthProfile: React.FC<PlotlyDepthProfileProps> = ({ samples, metric }) => {
  if (!samples || samples.length === 0) {
    return <div className="h-80 flex items-center justify-center text-slate-400 text-sm">No sample data for depth profile.</div>;
  }

  // Group samples by well
  const wells = Array.from(new Set(samples.map((s) => s.well_name)));
  
  const metricName = metric === 'toc' ? 'TOC (wt%)' : 'S2 (mg HC/g rock)';
  const metricColor = metric === 'toc' ? '#003366' : '#D97706';

  const data: any[] = wells.map((well) => {
    const wellSamples = samples
      .filter((s) => s.well_name === well)
      .sort((a, b) => a.depth_from - b.depth_from);

    return {
      x: wellSamples.map((s) => (metric === 'toc' ? s.toc : s.s2)),
      y: wellSamples.map((s) => s.depth_from),
      mode: 'lines+markers',
      name: well,
      type: 'scatter',
      marker: { size: 7 },
      line: { width: 2 },
      text: wellSamples.map(
        (s) =>
          `<b>Well:</b> ${s.well_name}<br>` +
          `<b>Depth:</b> ${s.depth_from} m<br>` +
          `<b>${metricName}:</b> ${metric === 'toc' ? s.toc : s.s2}<br>` +
          `<b>Lithology:</b> ${s.sample_type}<br>` +
          `<b>Grade:</b> ${metric === 'toc' ? s.toc_classification : s.s2_classification}`
      ),
      hoverinfo: 'text',
    };
  });

  const layout: any = {
    title: {
      text: `Geochemical Depth Profile: Depth vs ${metricName}`,
      font: { family: 'Inter, sans-serif', size: 14, color: '#0F172A' },
    },
    yaxis: {
      title: 'Measured Depth (m)',
      autorange: 'reversed', // Invert Y-axis for geological depth profiles!
      gridcolor: '#E2E8F0',
      zerolinecolor: '#000000',
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2
    },
    xaxis: {
      title: metricName,
      side: 'top', // Standard petroleum log layout: X-axis on top
      gridcolor: '#E2E8F0',
      zerolinecolor: '#000000',
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2
    },
    margin: { l: 60, r: 20, t: 80, b: 100 },
    autosize: true,
    hovermode: 'closest',
    legend: {
      orientation: 'h',
      x: 0.5,
      y: -0.22,
      xanchor: 'center',
      yanchor: 'top',
      bordercolor: '#cbd5e1',
      borderwidth: 1,
      font: { family: 'Inter, sans-serif', size: 10, color: '#475569' }
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: '#FAFAFA',
  };

  return (
    <div className="w-full h-96">
      <Plot
        data={data}
        layout={layout}
        useResizeHandler={true}
        className="w-full h-full"
        config={{ displayModeBar: true, responsive: true }}
      />
    </div>
  );
};
