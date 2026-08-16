import React from 'react';
import { CustomPlot as Plot } from './CustomPlot';
import { PetroleumSample } from '../../types';
import { TOC_COLORS } from '../../utils/constants';

interface PlotlyTocS2ScatterProps {
  samples: PetroleumSample[];
}

export const PlotlyTocS2Scatter: React.FC<PlotlyTocS2ScatterProps> = ({ samples }) => {
  if (!samples || samples.length === 0) {
    return <div className="h-80 flex items-center justify-center text-slate-400 text-sm">No sample data for TOC vs S2 scatter plot.</div>;
  }

  const grades = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

  const data: any[] = grades.map((grade) => {
    const gradeSamples = samples.filter((s) => s.toc_classification === grade);
    return {
      x: gradeSamples.map((s) => s.toc),
      y: gradeSamples.map((s) => s.s2),
      mode: 'markers',
      name: `TOC Grade: ${grade}`,
      type: 'scatter',
      marker: {
        size: 9,
        color: TOC_COLORS[grade] || '#64748B',
        opacity: 0.85,
        line: { color: '#FFFFFF', width: 1 },
      },
      text: gradeSamples.map(
        (s) =>
          `<b>Well:</b> ${s.well_name}<br>` +
          `<b>Depth:</b> ${s.depth_from} m<br>` +
          `<b>TOC:</b> ${s.toc} wt% (${s.toc_classification})<br>` +
          `<b>S2:</b> ${s.s2} mg/g (${s.s2_classification})<br>` +
          `<b>Type:</b> ${s.sample_type}`
      ),
      hoverinfo: 'text',
    };
  });

  const layout: any = {
    title: {
      text: 'Kerogen Generative Potential: TOC (wt%) vs S2 (mg HC/g rock)',
      font: { family: 'Inter, sans-serif', size: 14, color: '#0F172A' },
    },
    xaxis: {
      title: 'Total Organic Carbon — TOC (wt%)',
      gridcolor: '#E2E8F0',
      zerolinecolor: '#000000',
      rangemode: 'tozero',
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2
    },
    yaxis: {
      title: 'Pyrolysis Yield — S2 (mg HC/g rock)',
      gridcolor: '#E2E8F0',
      zerolinecolor: '#000000',
      rangemode: 'tozero',
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2
    },
    margin: { l: 60, r: 20, t: 60, b: 100 },
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
