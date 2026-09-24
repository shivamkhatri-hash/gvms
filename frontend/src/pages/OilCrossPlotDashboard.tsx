import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../components/common/Card';
import { KpiCard } from '../components/common/KpiCard';
import { CustomPlot as Plot } from '../components/charts/CustomPlot';
import { DynamicPlotlyChart } from '../components/charts/DynamicPlotlyChart';
import { Spinner } from '../components/common/Spinner';
import { Button } from '../components/common/Button';
import { Database, Filter, Layers, RefreshCw, AlertCircle, BarChart2, FileText, Download, CheckSquare, Square, Search } from 'lucide-react';
import api from '../services/api';
import { reportsService } from '../services/reports.service';

interface VariableDef {
  id: number;
  name: string;
  display_name: string;
  sql_column_name: string;
  sql_data_type: string;
  display_unit: string | null;
  category: string;
  is_numeric: boolean;
}

interface DatasetDef {
  id: number;
  name: string;
  display_name: string;
  sql_table_name: string;
  module: string;
  status: string | null;
  variables: VariableDef[];
}

const FORMATION_COLORS = [
  '#0284c7', // Sky Blue
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#16a34a', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#d97706', // Orange
];

const FORMATION_SYMBOLS = [
  'diamond',
  'square',
  'circle',
  'triangle-up',
  'triangle-down',
  'cross',
  'hexagon',
  'star',
];

export const OilCrossPlotDashboard: React.FC = () => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'scientific' | 'builder'>('scientific');
  
  // Filters state
  const [selectedFormations, setSelectedFormations] = useState<string[]>([]);
  const [selectedWells, setSelectedWells] = useState<string[]>([]);
  const [formationSearch, setFormationSearch] = useState<string>('');
  const [wellSearch, setWellSearch] = useState<string>('');

  // Interactive Chart Builder state
  const [xVar, setXVar] = useState<string>('oleanane_index');
  const [yVar, setYVar] = useState<string>('bcd_index');
  const [colorBy, setColorBy] = useState<string>('formation');
  const [chartType, setChartType] = useState<string>('scatter');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // 1. Fetch available datasets
  const { data: datasets, isLoading: datasetsLoading } = useQuery<DatasetDef[]>({
    queryKey: ['datasets'],
    queryFn: () => api.get<DatasetDef[]>('/datasets').then((res) => res.data),
  });

  // Default to hopane biomarker or oil dataset
  useEffect(() => {
    if (datasets && datasets.length > 0 && !selectedDatasetId) {
      const defaultDs =
        datasets.find((d) => d.name === 'hopane') ||
        datasets.find((d) => d.name === 'oil_composition') ||
        datasets[0];
      setSelectedDatasetId(defaultDs.id);
    }
  }, [datasets, selectedDatasetId]);

  const activeDataset = datasets?.find((d) => d.id === selectedDatasetId);

  // Set default axes when variables load
  useEffect(() => {
    if (activeDataset?.variables) {
      const numericVars = activeDataset.variables.filter((v) => v.is_numeric);
      if (numericVars.length >= 2) {
        setXVar(numericVars[0].sql_column_name);
        setYVar(numericVars[1].sql_column_name);
      }
    }
  }, [activeDataset]);

  // Serialized multi-select filters
  const serializedFilters = useMemo(() => {
    const params: Record<string, string> = {};
    if (selectedWells.length > 0) params.well_name = selectedWells.join(',');
    if (selectedFormations.length > 0) params.formation = selectedFormations.join(',');
    return params;
  }, [selectedWells, selectedFormations]);

  // 2. Fetch live records for the active dataset
  const {
    data: rawRecords,
    isLoading: recordsLoading,
    refetch,
    isError,
  } = useQuery<any[]>({
    queryKey: ['crossplot-live-data', selectedDatasetId, serializedFilters],
    queryFn: () =>
      api
        .get<any[]>('/dashboard/scientific-plots', {
          params: { dataset_id: selectedDatasetId, ...serializedFilters },
        })
        .then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  // 3. Fetch Interactive Custom Chart Data from backend
  const { data: customChartData, isLoading: customChartLoading } = useQuery({
    queryKey: [
      'chart-builder-crossplot',
      selectedDatasetId,
      xVar,
      yVar,
      chartType,
      colorBy,
      serializedFilters,
    ],
    queryFn: () =>
      api
        .get('/dashboard/chart-data', {
          params: {
            dataset_id: selectedDatasetId,
            x_axis: xVar,
            y_axis: yVar || undefined,
            chart_type: chartType,
            color_by: colorBy || undefined,
            ...serializedFilters,
          },
        })
        .then((res) => res.data),
    enabled: activeTab === 'builder' && !!selectedDatasetId && !!xVar,
  });

  // Helper function to extract and normalize numeric ratio values from live DB columns
  const parsedRecords = useMemo(() => {
    if (!rawRecords || !Array.isArray(rawRecords)) return [];

    return rawRecords.map((row: any) => {
      const well =
        row.well_name ||
        row.name ||
        row.borehole_name ||
        row.ubhi ||
        'Well ' + (row.id || '1');

      const formation =
        row.formation ||
        row.layer_name ||
        row.material_type ||
        row.location ||
        'Formation 1';

      const depth =
        parseFloat(row.depth_top) ||
        parseFloat(row.interval_top) ||
        parseFloat(row.top_depth) ||
        parseFloat(row.depth) ||
        0;

      // Extract Biomarker / Oil parameters & ratios from database columns
      const oleanane =
        parseFloat(row.oleanane_index) ||
        (parseFloat(row.ola) && parseFloat(row.c30h)
          ? parseFloat(row.ola) / (parseFloat(row.ola) + parseFloat(row.c30h))
          : parseFloat(row.ratio1));

      const bcd =
        parseFloat(row.bcd_index) ||
        (parseFloat(row.bcd) && parseFloat(row.c30h)
          ? parseFloat(row.bcd) / (parseFloat(row.bcd) + parseFloat(row.c30h))
          : parseFloat(row.ratio2));

      const taraxastane =
        parseFloat(row.diahopane_index) ||
        (parseFloat(row.diahopane) && parseFloat(row.c30h)
          ? parseFloat(row.diahopane) / (parseFloat(row.diahopane) + parseFloat(row.c30h))
          : parseFloat(row.ratio3));

      const oleanoid =
        oleanane ||
        (parseFloat(row.olb) && parseFloat(row.c30h)
          ? parseFloat(row.olb) / (parseFloat(row.olb) + parseFloat(row.c30h))
          : parseFloat(row.ratio4));

      const bnh =
        parseFloat(row.bnh_index) ||
        (parseFloat(row.bnh) && parseFloat(row.c30h)
          ? parseFloat(row.bnh) / (parseFloat(row.bnh) + parseFloat(row.c30h))
          : parseFloat(row.ratio5));

      const bnl =
        parseFloat(row.c29ts_by_c29h_plus_c29ts) ||
        (parseFloat(row.c29_ts) && parseFloat(row.c29h)
          ? parseFloat(row.c29_ts) / (parseFloat(row.c29_ts) + parseFloat(row.c29h))
          : parseFloat(row.ratio6));

      return {
        id: row.id,
        well,
        formation,
        depth,
        oleanane: !isNaN(oleanane) ? oleanane : null,
        bcd: !isNaN(bcd) ? bcd : null,
        taraxastane: !isNaN(taraxastane) ? taraxastane : null,
        oleanoid: !isNaN(oleanoid) ? oleanoid : null,
        bnh: !isNaN(bnh) ? bnh : null,
        bnl: !isNaN(bnl) ? bnl : null,
        raw: row,
      };
    });
  }, [rawRecords]);

  // Extract unique formations and wells dynamically from live database
  const availableFormations = useMemo(() => {
    const set = new Set<string>();
    parsedRecords.forEach((d) => {
      if (d.formation) set.add(d.formation);
    });
    return Array.from(set);
  }, [parsedRecords]);

  const availableWells = useMemo(() => {
    const set = new Set<string>();
    parsedRecords.forEach((d) => {
      if (d.well) set.add(d.well);
    });
    return Array.from(set);
  }, [parsedRecords]);

  const toggleFormation = (form: string) => {
    setSelectedFormations((prev) =>
      prev.includes(form) ? prev.filter((f) => f !== form) : [...prev, form]
    );
  };

  const toggleWell = (w: string) => {
    setSelectedWells((prev) =>
      prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]
    );
  };

  // Filtered live data based on selected formation tags
  const filteredData = useMemo(() => {
    let list = parsedRecords;
    if (selectedFormations.length > 0) {
      list = list.filter((d) => selectedFormations.includes(d.formation));
    }
    if (selectedWells.length > 0) {
      list = list.filter((d) => selectedWells.includes(d.well));
    }
    return list;
  }, [parsedRecords, selectedFormations, selectedWells]);

  // Dynamic KPI Stats calculated from actual database records
  const kpiStats = useMemo(() => {
    const totalWells = new Set(filteredData.map((d) => d.well)).size;
    let maxBicadinane = 0;
    let maxOleanane = 0;
    let maxBnh = 0;
    let maxBnl = 0;

    filteredData.forEach((d) => {
      if (d.bcd !== null && d.bcd > maxBicadinane) maxBicadinane = d.bcd;
      if (d.oleanane !== null && d.oleanane > maxOleanane) maxOleanane = d.oleanane;
      if (d.bnh !== null && d.bnh > maxBnh) maxBnh = d.bnh;
      if (d.bnl !== null && d.bnl > maxBnl) maxBnl = d.bnl;
    });

    return { totalWells, maxBicadinane, maxOleanane, maxBnh, maxBnl };
  }, [filteredData]);

  // Export report with direct on-screen Plotly graph snapshots
  const handleExportPDF = async () => {
    if (!selectedDatasetId) return;
    setIsExporting(true);
    try {
      await reportsService.downloadReportWithSnapshots(selectedDatasetId, serializedFilters);
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Layout Defaults for Plotly
  const layoutDefaults = (title: string, xLabel: string, yLabel: string) => ({
    title: {
      text: `<b>${title}</b>`,
      x: 0.5,
      xanchor: 'center' as const,
      y: 0.02,
      yanchor: 'bottom' as const,
      font: { family: 'Inter, sans-serif', size: 12, color: '#1e293b', weight: 'bold' as any },
    },
    xaxis: {
      title: xLabel,
      gridcolor: '#F1F5F9',
      zeroline: false,
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2,
      tickfont: { size: 9, color: '#64748B' },
      titlefont: { size: 10, color: '#475569', weight: 'bold' },
    },
    yaxis: {
      title: yLabel,
      gridcolor: '#F1F5F9',
      zeroline: false,
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2,
      tickfont: { size: 9, color: '#64748B' },
      titlefont: { size: 10, color: '#475569', weight: 'bold' },
    },
    margin: { l: 55, r: 25, t: 40, b: 50 },
    autosize: true,
    hovermode: 'closest' as const,
    legend: {
      orientation: 'h' as const,
      x: 0.5,
      y: -0.25,
      xanchor: 'center' as const,
      yanchor: 'top' as const,
      font: { size: 9, color: '#475569' },
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: '#FFFFFF',
  });

  // Series generator linking directly to live database columns
  const generateSeries = (
    xKey: 'oleanane' | 'bcd' | 'taraxastane' | 'oleanoid' | 'bnh' | 'bnl',
    yKey: 'oleanane' | 'bcd' | 'taraxastane' | 'oleanoid' | 'bnh' | 'bnl'
  ) => {
    const activeFmList = selectedFormations.length > 0 ? selectedFormations : availableFormations;
    return activeFmList.map((form, idx) => {
      const filtered = filteredData.filter(
        (d) => d.formation === form && d[xKey] !== null && d[yKey] !== null
      );

      const color = FORMATION_COLORS[idx % FORMATION_COLORS.length];
      const symbol = FORMATION_SYMBOLS[idx % FORMATION_SYMBOLS.length];

      return {
        x: filtered.map((d) => d[xKey] as number),
        y: filtered.map((d) => d[yKey] as number),
        mode: 'markers' as const,
        name: form,
        type: 'scatter' as const,
        marker: {
          size: 9,
          color,
          symbol,
          opacity: 0.9,
          line: { color: '#000000', width: 0.5 },
        },
        text: filtered.map(
          (d) =>
            `<b>Well:</b> ${d.well}<br><b>Formation:</b> ${form}<br><b>Depth:</b> ${d.depth}m<br><b>X:</b> ${d[xKey]?.toFixed(3)}<br><b>Y:</b> ${d[yKey]?.toFixed(3)}`
        ),
        hoverinfo: 'text' as const,
      };
    });
  };

  const bicadinaneOleananeData = useMemo(
    () => generateSeries('oleanane', 'bcd'),
    [filteredData, selectedFormations, availableFormations]
  );
  const bnhBcdData = useMemo(
    () => generateSeries('bcd', 'bnh'),
    [filteredData, selectedFormations, availableFormations]
  );
  const oleanoidTaraxastaneData = useMemo(
    () => generateSeries('taraxastane', 'oleanoid'),
    [filteredData, selectedFormations, availableFormations]
  );
  const bnlBcdData = useMemo(
    () => generateSeries('bcd', 'bnl'),
    [filteredData, selectedFormations, availableFormations]
  );

  const bicadinaneOleananeLayout = useMemo(
    () =>
      layoutDefaults(
        'Bicadinane vs Oleanane Crossplot',
        'Oleanane / (Oleanane + C30H)',
        'Bicadinane / (Bicadinane + C30H)'
      ),
    []
  );
  const bnhBcdLayout = useMemo(
    () =>
      layoutDefaults(
        'BNH vs BCD Crossplot',
        'BCD / (BCD + C30H)',
        'BNH / (BNH + C30H)'
      ),
    []
  );
  const oleanoidTaraxastaneLayout = useMemo(
    () =>
      layoutDefaults(
        'Oleanoid vs Taraxastane Crossplot',
        'Taraxastane / (Taraxastane + C30H)',
        'Oleanoid / (Oleanoid + C30H)'
      ),
    []
  );
  const bnlBcdLayout = useMemo(
    () =>
      layoutDefaults(
        'BNL vs BCD Crossplot',
        'BCD / (BCD + C30H)',
        'BNL / (BNL + C30H)'
      ),
    []
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Lab Dataset Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            Geochemical Cross Plots & Dynamic Lab Visualizations
          </h1>
          <p className="text-xs text-slate-500">
            Authoritative dynamic biomarker & oil ratio crossplots and interactive custom graph maker connected to live database records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Tabs Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('scientific')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'scientific'
                  ? 'bg-white text-ongc-blue shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Scientific Cross Plots</span>
            </button>
            <button
              onClick={() => setActiveTab('builder')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'builder'
                  ? 'bg-white text-ongc-blue shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart2 className="h-3.5 w-3.5" />
              <span>Interactive Chart Builder</span>
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
            <Database className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-slate-600">Dataset:</span>
            <select
              value={selectedDatasetId || ''}
              onChange={(e) => setSelectedDatasetId(Number(e.target.value))}
              className="text-xs font-bold text-slate-800 bg-transparent border-none focus:outline-hidden cursor-pointer"
            >
              {datasets?.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.display_name || ds.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            isLoading={isExporting}
            icon={<FileText className="h-3.5 w-3.5 text-rose-500" />}
          >
            Export PDF Report
          </Button>

          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards (Computed from active database records) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          title="Total Data Wells"
          value={kpiStats.totalWells}
          description="Active database wells"
          icon={<Database className="w-4 h-4 text-slate-400" />}
        />
        <KpiCard
          title="Max Bicadinane Ratio"
          value={kpiStats.maxBicadinane > 0 ? kpiStats.maxBicadinane.toFixed(3) : '—'}
          description="BCD / (BCD + C30H)"
          icon={<Layers className="w-4 h-4 text-slate-400" />}
        />
        <KpiCard
          title="Max Oleanane Ratio"
          value={kpiStats.maxOleanane > 0 ? kpiStats.maxOleanane.toFixed(3) : '—'}
          description="Oleanane / (Oleanane + C30H)"
          icon={<Layers className="w-4 h-4 text-slate-400" />}
        />
        <KpiCard
          title="Max BNH Ratio"
          value={kpiStats.maxBnh > 0 ? kpiStats.maxBnh.toFixed(3) : '—'}
          description="BNH / (BNH + C30H)"
          icon={<Layers className="w-4 h-4 text-slate-400" />}
        />
        <KpiCard
          title="Max BNL Ratio"
          value={kpiStats.maxBnl > 0 ? kpiStats.maxBnl.toFixed(3) : '—'}
          description="BNL / (BNL + C30H)"
          icon={<Layers className="w-4 h-4 text-slate-400" />}
        />
      </div>

      {/* Multi-Select Filters Panel */}
      <Card title="Multi-Select Formations & Wells Filter Scope" className="border border-slate-200 shadow-sm p-4 rounded-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Formations Multi-Select */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Formations ({selectedFormations.length === 0 ? 'All' : selectedFormations.length})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedFormations(availableFormations)}
                  className="text-[10px] font-semibold text-ongc-blue hover:underline"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedFormations([])}
                  className="text-[10px] font-semibold text-slate-500 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-lg">
              {availableFormations.map((form, idx) => {
                const active = selectedFormations.includes(form);
                const color = FORMATION_COLORS[idx % FORMATION_COLORS.length];
                return (
                  <button
                    key={form}
                    type="button"
                    onClick={() => toggleFormation(form)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all border ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: color }} />
                    <span>{form}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wells Multi-Select */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Wells ({selectedWells.length === 0 ? 'All' : selectedWells.length})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedWells(availableWells)}
                  className="text-[10px] font-semibold text-ongc-blue hover:underline"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedWells([])}
                  className="text-[10px] font-semibold text-slate-500 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-lg">
              {availableWells.map((well) => {
                const active = selectedWells.includes(well);
                return (
                  <button
                    key={well}
                    type="button"
                    onClick={() => toggleWell(well)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all border ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {well}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Tab 1: Scientific Cross Plots */}
      {activeTab === 'scientific' && (
        <>
          {recordsLoading ? (
            <div className="h-80 flex items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : isError ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 text-xs">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>Could not retrieve lab records for crossplot rendering.</span>
            </div>
          ) : parsedRecords.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-xs border border-dashed rounded-2xl bg-white">
              No records found matching the active filter selections.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between bg-white">
                <div className="w-full h-[450px]">
                  <Plot
                    data={bicadinaneOleananeData}
                    layout={bicadinaneOleananeLayout}
                    useResizeHandler={true}
                    className="w-full h-full"
                    config={{ responsive: true }}
                  />
                </div>
              </Card>

              <Card className="border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between bg-white">
                <div className="w-full h-[450px]">
                  <Plot
                    data={bnhBcdData}
                    layout={bnhBcdLayout}
                    useResizeHandler={true}
                    className="w-full h-full"
                    config={{ responsive: true }}
                  />
                </div>
              </Card>

              <Card className="border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between bg-white">
                <div className="w-full h-[450px]">
                  <Plot
                    data={oleanoidTaraxastaneData}
                    layout={oleanoidTaraxastaneLayout}
                    useResizeHandler={true}
                    className="w-full h-full"
                    config={{ responsive: true }}
                  />
                </div>
              </Card>

              <Card className="border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between bg-white">
                <div className="w-full h-[450px]">
                  <Plot
                    data={bnlBcdData}
                    layout={bnlBcdLayout}
                    useResizeHandler={true}
                    className="w-full h-full"
                    config={{ responsive: true }}
                  />
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Tab 2: Interactive Dynamic Chart Builder */}
      {activeTab === 'builder' && (
        <div className="space-y-6">
          <Card title="Dynamic Graph Maker Controls" className="p-4 rounded-2xl border border-slate-200 bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">X-Axis Variable</label>
                <select
                  value={xVar}
                  onChange={(e) => setXVar(e.target.value)}
                  className="w-full text-xs font-semibold py-2 px-3 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-ongc-blue"
                >
                  {activeDataset?.variables?.map((v) => (
                    <option key={v.sql_column_name} value={v.sql_column_name}>
                      {v.display_name} {v.display_unit ? `(${v.display_unit})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Y-Axis Variable</label>
                <select
                  value={yVar}
                  onChange={(e) => setYVar(e.target.value)}
                  className="w-full text-xs font-semibold py-2 px-3 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-ongc-blue"
                >
                  <option value="">None (Histogram / Distribution)</option>
                  {activeDataset?.variables?.map((v) => (
                    <option key={v.sql_column_name} value={v.sql_column_name}>
                      {v.display_name} {v.display_unit ? `(${v.display_unit})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Color / Group By</label>
                <select
                  value={colorBy}
                  onChange={(e) => setColorBy(e.target.value)}
                  className="w-full text-xs font-semibold py-2 px-3 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-ongc-blue"
                >
                  <option value="">Default (Single Color)</option>
                  <option value="formation">Formation</option>
                  <option value="well_name">Well Name</option>
                  <option value="sample_type">Sample Type</option>
                  {activeDataset?.variables?.filter((v) => !v.is_numeric).map((v) => (
                    <option key={v.sql_column_name} value={v.sql_column_name}>
                      {v.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Chart Type</label>
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value)}
                  className="w-full text-xs font-semibold py-2 px-3 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-ongc-blue"
                >
                  <option value="scatter">Scatter Plot</option>
                  <option value="line">Line Plot</option>
                  <option value="bar">Bar Chart</option>
                  <option value="histogram">Histogram / Frequency</option>
                  <option value="box">Box & Whisker Plot</option>
                  <option value="correlation_matrix">Correlation Matrix</option>
                </select>
              </div>
            </div>
          </Card>

          <Card title="Custom Generated Visualization" className="p-4 rounded-2xl border border-slate-200 bg-white">
            {customChartLoading ? (
              <div className="h-96 flex items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <div className="w-full h-[550px]">
                <DynamicPlotlyChart
                  chartType={chartType}
                  data={customChartData}
                  xLabel={xVar}
                  yLabel={yVar}
                  colorByLabel={colorBy}
                  title={`${xVar.toUpperCase()} vs ${yVar ? yVar.toUpperCase() : 'Distribution'}`}
                />
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
