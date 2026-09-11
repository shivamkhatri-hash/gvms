import React, { useState, useMemo } from 'react';
import { Card } from '../components/common/Card';
import { KpiCard } from '../components/common/KpiCard';
import { CustomPlot as Plot } from '../components/charts/CustomPlot';
import { Database, Filter, Layers } from 'lucide-react';
import { crossDataList, CrossData } from './oilLabData';

const FORMATION_STYLES: Record<string, { color: string; symbol: string }> = {
  'Formation 1': { color: '#0284c7', symbol: 'diamond' },
  'Formation 2': { color: '#ec4899', symbol: 'square' },
  'Formation 3': { color: '#8b5cf6', symbol: 'circle' },
  'Formation 4': { color: '#16a34a', symbol: 'triangle-up' }
};

export const OilCrossPlotDashboard: React.FC = () => {
  const [selectedFormations, setSelectedFormations] = useState<string[]>([
    'Formation 1',
    'Formation 2',
    'Formation 3',
    'Formation 4'
  ]);

  const toggleFormation = (form: string) => {
    setSelectedFormations((prev) =>
      prev.includes(form) ? prev.filter((f) => f !== f) : [...prev, form]
    );
  };

  const handleSelectAll = () => {
    setSelectedFormations(['Formation 1', 'Formation 2', 'Formation 3', 'Formation 4']);
  };

  const handleClearAll = () => {
    setSelectedFormations([]);
  };

  // Filtered dataset
  const filteredData = useMemo(() => {
    return crossDataList.filter(
      (d) => selectedFormations.includes(d.formation) || (d.formation === 'Unknown' && selectedFormations.length === 4)
    );
  }, [selectedFormations]);

  // KPI Calculations
  const kpiStats = useMemo(() => {
    const validData = crossDataList.filter((d) => d.ratio1 !== null);
    const totalWells = validData.length;
    let maxBicadinane = 0;
    let maxOleanane = 0;
    let maxBnh = 0;
    let maxBnl = 0;

    validData.forEach((d) => {
      if (d.ratio2 !== null && d.ratio2 > maxBicadinane) maxBicadinane = d.ratio2;
      if (d.ratio1 !== null && d.ratio1 > maxOleanane) maxOleanane = d.ratio1;
      if (d.ratio5 !== null && d.ratio5 > maxBnh) maxBnh = d.ratio5;
      if (d.ratio6 !== null && d.ratio6 > maxBnl) maxBnl = d.ratio6;
    });

    return { totalWells, maxBicadinane, maxOleanane, maxBnh, maxBnl };
  }, []);

  const layoutDefaults = (title: string, xLabel: string, yLabel: string) => ({
    title: {
      text: title,
      font: { family: 'Inter, sans-serif', size: 13, color: '#0F172A', weight: 'bold' }
    },
    xaxis: {
      title: xLabel,
      gridcolor: '#F1F5F9',
      zeroline: false,
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2.5,
      tickfont: { size: 9, color: '#64748B' },
      titlefont: { size: 10, color: '#475569', weight: 'bold' }
    },
    yaxis: {
      title: yLabel,
      gridcolor: '#F1F5F9',
      zeroline: false,
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2.5,
      tickfont: { size: 9, color: '#64748B' },
      titlefont: { size: 10, color: '#475569', weight: 'bold' }
    },
    margin: { l: 55, r: 25, t: 45, b: 45 },
    autosize: true,
    hovermode: 'closest',
    legend: {
      orientation: 'h',
      x: 0.5,
      y: -0.22,
      xanchor: 'center',
      yanchor: 'top',
      font: { size: 9, color: '#475569' }
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: '#FFFFFF'
  });

  const generateSeries = (xKey: keyof CrossData, yKey: keyof CrossData) => {
    const formations = ['Formation 1', 'Formation 2', 'Formation 3', 'Formation 4'];
    return formations
      .filter((f) => selectedFormations.includes(f))
      .map((form) => {
        const filtered = crossDataList.filter(
          (d) => d.formation === form && d[xKey] !== null && d[yKey] !== null
        );
        return {
          x: filtered.map((d) => d[xKey] as number),
          y: filtered.map((d) => d[yKey] as number),
          mode: 'markers',
          name: form,
          type: 'scatter',
          marker: {
            size: 9,
            color: FORMATION_STYLES[form].color,
            symbol: FORMATION_STYLES[form].symbol,
            opacity: 0.9,
            line: { color: '#000000', width: 0.5 }
          },
          text: filtered.map((d) => `<b>Well:</b> ${d.well}<br><b>Formation:</b> ${form}<br><b>X:</b> ${d[xKey]}<br><b>Y:</b> ${d[yKey]}`),
          hoverinfo: 'text'
        };
      });
  };

  const bicadinaneOleananeData = useMemo(() => generateSeries('ratio1', 'ratio2'), [selectedFormations]);
  const bnhBcdData = useMemo(() => generateSeries('ratio2', 'ratio5'), [selectedFormations]);
  const oleanoidTaraxastaneData = useMemo(() => generateSeries('ratio3', 'ratio4'), [selectedFormations]);
  const bnlBcdData = useMemo(() => generateSeries('ratio2', 'ratio6'), [selectedFormations]);

  const bicadinaneOleananeLayout = useMemo(() => layoutDefaults('Bicadinane vs Oleanane Crossplot', 'Oleanane / (Oleanane + C30H)', 'Bicadinane / (Bicadinane + C30H)'), []);
  const bnhBcdLayout = useMemo(() => layoutDefaults('BNH vs BCD Crossplot', 'BCD / (BCD + C30H)', 'BNH / (BNH + C30H)'), []);
  const oleanoidTaraxastaneLayout = useMemo(() => layoutDefaults('Oleanoid vs Taraxastane Crossplot', 'Taraxastane / (Taraxastane + C30H)', 'Oleanoid / (Oleanoid + C30H)'), []);
  const bnlBcdLayout = useMemo(() => layoutDefaults('BNL vs BCD Crossplot', 'BCD / (BCD + C30H)', 'BNL / (BNL + C30H)'), []);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <KpiCard title="Total Data Wells" value={kpiStats.totalWells} description="Wells with valid ratios" icon={<Database className="w-4 h-4 text-slate-400" />} />
        <KpiCard title="Max Bicadinane Ratio" value={kpiStats.maxBicadinane.toFixed(3)} description="BCD / (BCD + C30H)" icon={<Layers className="w-4 h-4 text-slate-400" />} />
        <KpiCard title="Max Oleanane Ratio" value={kpiStats.maxOleanane.toFixed(3)} description="Oleanane / (Oleanane + C30H)" icon={<Layers className="w-4 h-4 text-slate-400" />} />
        <KpiCard title="Max BNH Ratio" value={kpiStats.maxBnh.toFixed(3)} description="BNH / (BNH + C30H)" icon={<Layers className="w-4 h-4 text-slate-400" />} />
        <KpiCard title="Max BNL Ratio" value={kpiStats.maxBnl.toFixed(3)} description="BNL / (BNL + C30H)" icon={<Layers className="w-4 h-4 text-slate-400" />} />
      </div>

      {/* Scoping Filters */}
      <Card title="Scope Formation Boundaries" className="border border-slate-200 shadow-sm p-4 rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2.5">
            {['Formation 1', 'Formation 2', 'Formation 3', 'Formation 4'].map((form) => {
              const active = selectedFormations.includes(form);
              const style = FORMATION_STYLES[form];
              return (
                <button
                  key={form}
                  onClick={() => toggleFormation(form)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-xs"
                    style={{
                      backgroundColor: style.color,
                      clipPath:
                        style.symbol === 'square'
                          ? 'none'
                          : style.symbol === 'triangle-up'
                          ? 'polygon(50% 0%, 0% 100%, 100% 100%)'
                          : style.symbol === 'diamond'
                          ? 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
                          : 'circle(50% at 50% 50%)'
                    }}
                  />
                  <span>{form}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs font-bold text-slate-800 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md transition-colors"
            >
              Select All
            </button>
            <button
              onClick={handleClearAll}
              className="text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 px-2.5 py-1.5 rounded-md transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>
      </Card>

      {/* Grid of 4 plots */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between">
          <div className="w-full h-[450px]">
            <Plot data={bicadinaneOleananeData} layout={bicadinaneOleananeLayout} useResizeHandler={true} className="w-full h-full" config={{ responsive: true }} />
          </div>
        </Card>

        <Card className="border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between">
          <div className="w-full h-[450px]">
            <Plot data={bnhBcdData} layout={bnhBcdLayout} useResizeHandler={true} className="w-full h-full" config={{ responsive: true }} />
          </div>
        </Card>

        <Card className="border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between">
          <div className="w-full h-[450px]">
            <Plot data={oleanoidTaraxastaneData} layout={oleanoidTaraxastaneLayout} useResizeHandler={true} className="w-full h-full" config={{ responsive: true }} />
          </div>
        </Card>

        <Card className="border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between">
          <div className="w-full h-[450px]">
            <Plot data={bnlBcdData} layout={bnlBcdLayout} useResizeHandler={true} className="w-full h-full" config={{ responsive: true }} />
          </div>
        </Card>
      </div>

      {/* Table view */}
      <Card title="Authoritative Cross Plot Dataset" className="border border-slate-200 shadow-sm overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Well Name</th>
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Ol/Ol+30H (1+2)</th>
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">BCD(1+2)/30H+BCD(1+2)_217</th>
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">T/T+30H</th>
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">olenoid(C)/C30H+Ole</th>
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">BNH/BNH+30H</th>
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">BNL/BNL+30H</th>
                <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Formation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.map((d, idx) => (
                <tr key={`${d.well}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3.5 text-xs font-bold text-slate-800">{d.well}</td>
                  <td className="px-6 py-3.5 text-xs text-slate-600 font-semibold">{d.ratio1 !== null ? d.ratio1.toFixed(3) : '-'}</td>
                  <td className="px-6 py-3.5 text-xs text-slate-600 font-semibold">{d.ratio2 !== null ? d.ratio2.toFixed(3) : '-'}</td>
                  <td className="px-6 py-3.5 text-xs text-slate-600 font-semibold">{d.ratio3 !== null ? d.ratio3.toFixed(3) : '-'}</td>
                  <td className="px-6 py-3.5 text-xs text-slate-600 font-semibold">{d.ratio4 !== null ? d.ratio4.toFixed(3) : '-'}</td>
                  <td className="px-6 py-3.5 text-xs text-slate-600 font-semibold">{d.ratio5 !== null ? d.ratio5.toFixed(3) : '-'}</td>
                  <td className="px-6 py-3.5 text-xs text-slate-600 font-semibold">{d.ratio6 !== null ? d.ratio6.toFixed(3) : '-'}</td>
                  <td className="px-6 py-3.5 text-xs">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: FORMATION_STYLES[d.formation]?.color + '15',
                        color: FORMATION_STYLES[d.formation]?.color || '#64748B'
                      }}
                    >
                      <span className="w-1 h-1 rounded-full" style={{ backgroundColor: FORMATION_STYLES[d.formation]?.color || '#64748B' }} />
                      {d.formation}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
