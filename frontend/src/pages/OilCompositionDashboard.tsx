import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Layers, Filter, RefreshCw, BarChart2, CheckSquare, Square, Search, Sliders, FileText, Download, Activity } from 'lucide-react';
import { CustomPlot as Plot } from '../components/charts/CustomPlot';
import { Card } from '../components/common/Card';
import { KpiCard } from '../components/common/KpiCard';
import { Spinner } from '../components/common/Spinner';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { formatNumber } from '../utils/formatters';
import { DynamicPlotlyChart } from '../components/charts/DynamicPlotlyChart';
import api from '../services/api';
import { reportsService } from '../services/reports.service';
import { applyGlobalLayoutDefaults, GLOBAL_PLOTLY_EXPORT_CONFIG } from '../utils/plotlyConfig';
import { DashboardDatasetTable } from '../components/common/DashboardDatasetTable';


interface VariableDef {
  id: number;
  name: string;
  display_name: string;
  sql_column_name: string;
  sql_data_type: string;
  display_unit: string | null;
  category: string;
  is_numeric: boolean;
  is_required: boolean;
  is_calculated: boolean;
  formula: string | null;
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

const PresetChartCard: React.FC<{
  datasetId: number;
  title: string;
  chartType: string;
  xVar: string;
  yVar?: string;
  serializedFilters: any;
  hasVariable: (col: string) => boolean;
  variables: VariableDef[];
}> = ({ datasetId, title, chartType, xVar, yVar, serializedFilters, hasVariable, variables }) => {
  const xExists = hasVariable(xVar);
  const yExists = !yVar || hasVariable(yVar);

  if (!xExists || !yExists) return null;

  const { data: chartData, isLoading } = useQuery({
    queryKey: ['preset-chart', datasetId, chartType, xVar, yVar, serializedFilters],
    queryFn: () =>
      api.get('/dashboard/chart-data', {
        params: {
          dataset_id: datasetId,
          x_axis: xVar,
          y_axis: yVar || undefined,
          chart_type: chartType,
          ...serializedFilters
        }
      }).then(res => res.data),
    enabled: !!datasetId
  });

  return (
    <Card title={title} className="border border-slate-200 shadow-sm overflow-hidden flex flex-col p-5 rounded-2xl">
      {isLoading ? (
        <div className="h-80 flex items-center justify-center">
          <Spinner />
        </div>
      ) : (
      <div className="h-80 flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl bg-slate-50 w-full">
        No graph implemented. Ready for manual implementation.
      </div>
      )}
    </Card>
  );
};

export const OilCompositionDashboard: React.FC = () => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);

  // Custom builder states
  const [xVar, setXVar] = useState<string>('api_gravity');
  const [yVar, setYVar] = useState<string>('sulfur');
  const [colorBy, setColorBy] = useState<string>('');
  const [chartType, setChartType] = useState<string>('scatter');

  // Filters state
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [activeFiltersCount, setActiveFiltersCount] = useState<number>(0);
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Search filter options inside search boxes
  const [filterSearches, setFilterSearches] = useState<Record<string, string>>({});

  // 1. Fetch Datasets
  const { data: datasets, isLoading: datasetsLoading } = useQuery<DatasetDef[]>({
    queryKey: ['datasets'],
    queryFn: () => api.get<DatasetDef[]>('/datasets').then((res) => res.data),
  });

  const oilDataset = datasets?.find((d) => d.name === 'oil_composition');

  useEffect(() => {
    if (oilDataset) {
      setSelectedDatasetId(oilDataset.id);
    }
  }, [oilDataset]);

  // 2. Fetch Metadata filter options
  const { data: metadata, isLoading: metaLoading } = useQuery({
    queryKey: ['metadata', selectedDatasetId],
    queryFn: () =>
      api.get<{
        filter_options?: Record<string, string[]>;
        filter_ranges?: Record<string, { min: number; max: number }>;
      }>('/metadata', {
        params: { dataset_id: selectedDatasetId },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  // Calculate active filters count
  useEffect(() => {
    let count = 0;
    Object.entries(filters).forEach(([key, val]) => {
      if (Array.isArray(val) && val.length > 0) {
        count += 1;
      } else if (typeof val === 'object' && val !== null) {
        if (val.min !== undefined || val.max !== undefined) {
          count += 1;
        }
      }
    });
    setActiveFiltersCount(count);
  }, [filters]);

  // Reset Filters
  const handleResetFilters = () => {
    setFilters({});
  };

  // Toggle multi-select options
  const toggleMultiSelect = (key: string, val: string) => {
    setFilters((prev) => {
      const current = prev[key] || [];
      const updated = current.includes(val)
        ? current.filter((x: string) => x !== val)
        : [...current, val];
      return {
        ...prev,
        [key]: updated.length > 0 ? updated : undefined,
      };
    });
  };

  // Update range inputs
  const handleRangeChange = (key: string, bound: 'min' | 'max', val: string) => {
    setFilters((prev) => {
      const current = prev[key] || {};
      const numVal = val === '' ? undefined : parseFloat(val);
      const updated = { ...current, [bound]: numVal };

      if (updated.min === undefined && updated.max === undefined) {
        return { ...prev, [key]: undefined };
      }
      return { ...prev, [key]: updated };
    });
  };

  // Format parameter name to title case
  const formatParamLabel = (str: string) => {
    return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Convert filters object into query params
  const serializedFilters = React.useMemo(() => {
    const params: Record<string, string> = {};
    Object.entries(filters).forEach(([key, val]) => {
      if (val === undefined || val === null) return;
      if (Array.isArray(val)) {
        params[key] = val.join(',');
      } else if (typeof val === 'object') {
        if (val.min !== undefined) params[`${key}_min`] = String(val.min);
        if (val.max !== undefined) params[`${key}_max`] = String(val.max);
      }
    });
    return params;
  }, [filters]);

  // 3. Fetch Summary KPIs
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats-dynamic', selectedDatasetId, serializedFilters],
    queryFn: () =>
      api.get('/dashboard', {
        params: {
          dataset_id: selectedDatasetId,
          ...serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  // 4. Fetch Interactive Custom Chart Data from backend
  const { data: chartData, isLoading: chartLoading, refetch: refetchChart } = useQuery({
    queryKey: [
      'chart-builder-data',
      selectedDatasetId,
      xVar,
      yVar,
      chartType,
      colorBy,
      serializedFilters,
    ],
    queryFn: () =>
      api.get('/dashboard/chart-data', {
        params: {
          dataset_id: selectedDatasetId,
          x_axis: xVar,
          y_axis: yVar || undefined,
          chart_type: chartType,
          color_by: colorBy || undefined,
          ...serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId && !!xVar && !!chartType,
  });

  // 5. Fetch All Filtered Oil Composition Records for Scientific Dashboard
  const { data: oilData, isLoading: oilDataLoading, refetch: refetchOil } = useQuery<any[]>({
    queryKey: ['scientific-plots-data', selectedDatasetId, serializedFilters],
    queryFn: () =>
      api.get<any[]>('/dashboard/scientific-plots', {
        params: {
          dataset_id: selectedDatasetId,
          ...serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  const handleRefreshAll = () => {
    refetchStats();
    refetchChart();
    refetchOil();
  };

  // Export report with direct on-screen Plotly graph snapshots for PDF
  const handleExport = async (fmt: 'pdf' | 'excel' | 'csv') => {
    if (!selectedDatasetId) return;
    try {
      if (fmt === 'pdf') {
        await reportsService.downloadReportWithSnapshots(selectedDatasetId, serializedFilters);
      } else {
        await reportsService.downloadReport(fmt, selectedDatasetId, serializedFilters);
      }
    } catch (err) {
      console.error('Failed to export report:', err);
    }
  };

  // API Gravity vs Depth scientific points mapping (declared before early returns to satisfy React rules of hooks)
  const apiVsDepthPoints = React.useMemo(() => {
    if (!oilData || !Array.isArray(oilData)) return [];
    return oilData
      .map((d) => {
        const xVal = d.api_gravity;
        const yVal = d.interval_top; // Subsurface depth
        
        if (xVal === undefined || xVal === null || isNaN(parseFloat(xVal)) ||
            yVal === undefined || yVal === null || isNaN(parseFloat(yVal))) {
          return null;
        }

        return {
          ...d, // Keep all raw database columns attached for tooltips & click handlers
          x: parseFloat(xVal),
          y: parseFloat(yVal),
          color_by: d.well_name || 'N/A'
        };
      })
      .filter((p) => p !== null);
  }, [oilData]);



  // State for tabs
  const [activeTab, setActiveTab] = useState<'scientific' | 'workbook' | 'builder'>('scientific');

  // Filter static workbook lists based on the active sidebar filters
  const filterWorkbookData = <T extends { well: string; formation?: string }>(dataList: T[]): T[] => {
    return dataList.filter((d) => {
      // 1. Filter by Well Name
      if (filters.well_name && filters.well_name.length > 0) {
        const wellLower = d.well.toLowerCase();
        const matchesWell = filters.well_name.some((w: string) => 
          w.toLowerCase() === wellLower || wellLower.includes(w.toLowerCase())
        );
        if (!matchesWell) return false;
      }
      // 2. Filter by Formation
      if (filters.formation && filters.formation.length > 0 && d.formation) {
        const formLower = d.formation.toLowerCase();
        const matchesForm = filters.formation.some((f: string) => 
          f.toLowerCase() === formLower || formLower.includes(f.toLowerCase())
        );
        if (!matchesForm) return false;
      }
      return true;
    });
  };



  if (datasetsLoading || !selectedDatasetId) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Get lists of options
  const variables = oilDataset?.variables || [];
  const numericVars = variables.filter((v) => v.is_numeric);
  const categoricalVars = variables.filter((v) => !v.is_numeric && !v.is_calculated);

  const hasVariable = (colName: string) => {
    return variables.some(v => v.sql_column_name === colName);
  };

  // Stacked SARA bar data mapping
  const saraStackedData = (oilData || [])
    .filter(d => d.sat !== undefined || d.ar !== undefined || d.nso !== undefined || d.asp !== undefined)
    .map(d => ({
      label: `Well: ${d.well_name || 'N/A'} | Obj: ${d.object_number || 'N/A'} | Depth: ${d.interval_top || 0} m`,
      sat: parseFloat(d.sat) || 0,
      ar: parseFloat(d.ar) || 0,
      nso: parseFloat(d.nso) || 0,
      asp: parseFloat(d.asp) || 0
    }));

  // API Gravity vs Depth scientific points mapping is now declared at the top level

  return (
    <div className="space-y-6">
      {/* Datasets Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Datasets</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={handleRefreshAll}
          >
            Refresh Data
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<FileText className="w-3.5 h-3.5" />}
            onClick={() => handleExport('pdf')}
          >
            PDF Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() => handleExport('excel')}
          >
            Excel
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <Card key={idx} className="h-24 animate-pulse bg-slate-50 border-slate-100">
              <div className="h-12" />
            </Card>
          ))
        ) : (
          <>
            {/* KPI 1: Samples count */}
            <KpiCard
              title="Total Samples"
              value={formatNumber(stats?.total_records || 0)}
              description="Active observation values"
              accentColorClass="border-l-ongc-blue"
            />

            {/* KPI 2: Average API Gravity */}
            <KpiCard
              title="Avg API Gravity"
              value={<>{stats?.kpis?.find((k: any) => k.name === 'api_gravity')?.avg?.toFixed(2) || '0.00'}<span className="text-[10px] font-normal text-slate-500">°</span></>}
              description={`Range: ${stats?.kpis?.find((k: any) => k.name === 'api_gravity')?.min?.toFixed(2) || '0.00'}° - ${stats?.kpis?.find((k: any) => k.name === 'api_gravity')?.max?.toFixed(2) || '0.00'}°`}
              accentColorClass="border-l-amber-500"
            />

            {/* KPI 3: Avg Sulfur */}
            <KpiCard
              title="Avg Sulfur"
              value={<>{stats?.kpis?.find((k: any) => k.name === 'sulfur')?.avg?.toFixed(2) || '0.00'}<span className="text-[10px] font-normal text-slate-500">%</span></>}
              description={`Range: ${stats?.kpis?.find((k: any) => k.name === 'sulfur')?.min?.toFixed(2) || '0.00'}% - ${stats?.kpis?.find((k: any) => k.name === 'sulfur')?.max?.toFixed(2) || '0.00'}%`}
              accentColorClass="border-l-emerald-500"
            />

            {/* KPI 4: Avg Water Content */}
            <KpiCard
              title="Avg Water Content"
              value={<>{stats?.kpis?.find((k: any) => k.name === 'water_content')?.avg?.toFixed(2) || '0.00'}<span className="text-[10px] font-normal text-slate-500">%</span></>}
              description={`Range: ${stats?.kpis?.find((k: any) => k.name === 'water_content')?.min?.toFixed(2) || '0.00'}% - ${stats?.kpis?.find((k: any) => k.name === 'water_content')?.max?.toFixed(2) || '0.00'}%`}
              accentColorClass="border-l-purple-500"
            />
          </>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('scientific')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'scientific'
              ? 'border-ongc-blue text-ongc-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-350'
          }`}
        >
          🔬 Scientific Plots
        </button>
        <button
          onClick={() => setActiveTab('builder')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'builder'
              ? 'border-ongc-blue text-ongc-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-350'
          }`}
        >
          ⚙️ Interactive Chart Builder
        </button>
      </div>
      {/* Collapsible Filters Card */}
      <Card className="bg-slate-50/50 border-slate-200 shadow-xs animate-fade-in" noPadding>
        <div 
          className={`flex items-center justify-between cursor-pointer p-6 ${showFilters ? 'border-b border-slate-200' : ''}`} 
          onClick={() => setShowFilters(!showFilters)}
        >
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-ongc-blue" />
            <span>REGISTRY FILTERS</span>
            {(!showFilters) && (
              <Badge label="Collapsed" />
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); handleResetFilters(); }}
              className="text-[10px] font-bold text-slate-400 hover:text-ongc-blue transition-colors"
            >
              Clear All
            </button>
            <span className="text-xs font-bold text-slate-500 hover:text-slate-800 select-none">
              {showFilters ? 'Hide Filters ˄' : 'Show Filters ˅'}
            </span>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 p-6">
            {/* Categorical Filters */}
            {metadata?.filter_options &&
              Object.entries(metadata.filter_options)
                .filter(([key]) => ['formation', 'location', 'material_type', 'well_name', 'object_number', 'ubhi', 'analysis_date'].includes(key))
                .map(([key, opts]) => {
                  const searchVal = filterSearches[key] || '';
                  const filteredOpts = (opts || []).filter((o) =>
                    o.toLowerCase().includes(searchVal.toLowerCase())
                  );
                  const checkedOpts = filters[key] || [];

                  return (
                    <div key={key} className="space-y-1.5 p-2.5 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                        {formatParamLabel(key === 'well_name' ? 'Well Name' : key)}
                      </label>

                      {/* Inner Search Box */}
                      {opts.length > 5 && (
                        <div className="relative">
                          <input
                            type="text"
                            placeholder={`Search...`}
                            value={searchVal}
                            onChange={(e) =>
                              setFilterSearches((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            className="w-full text-xs rounded-lg border-slate-250 bg-slate-50/50 py-1 pl-6 pr-2 focus:ring-1 focus:ring-ongc-blue"
                          />
                          <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                        </div>
                      )}

                      <div className="max-h-24 overflow-y-auto space-y-1.5 pt-1 pl-1 flex-1">
                        {filteredOpts.length === 0 ? (
                          <div className="text-[10px] text-slate-400 italic">No matches</div>
                        ) : (
                          filteredOpts.map((opt) => {
                            const isChecked = checkedOpts.includes(opt);
                            return (
                              <div
                                key={opt}
                                onClick={() => toggleMultiSelect(key, opt)}
                                className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 hover:text-slate-800"
                              >
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-ongc-blue shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-300 shrink-0" />
                                )}
                                <span className="truncate">{opt}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}

            {/* Numeric Bound Filters */}
            {metadata?.filter_ranges &&
              Object.entries(metadata.filter_ranges).map(([key, range]) => {
                const current = filters[key] || {};
                return (
                  <div key={key} className="space-y-1.5 p-2.5 bg-white border border-slate-100 rounded-xl shadow-3xs">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                      {formatParamLabel(key)}
                    </label>
                    <div className="flex gap-2">
                      <div className="w-1/2">
                        <label className="text-[9px] text-slate-400 block">Min Bound</label>
                        <input
                          type="number"
                          placeholder={range.min.toFixed(2)}
                          value={current.min === undefined ? '' : current.min}
                          onChange={(e) => handleRangeChange(key, 'min', e.target.value)}
                          className="w-full text-xs rounded-lg border-slate-250 bg-slate-50/50 py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                        />
                      </div>
                      <div className="w-1/2">
                        <label className="text-[9px] text-slate-400 block">Max Bound</label>
                        <input
                          type="number"
                          placeholder={range.max.toFixed(2)}
                          value={current.max === undefined ? '' : current.max}
                          onChange={(e) => handleRangeChange(key, 'max', e.target.value)}
                          className="w-full text-xs rounded-lg border-slate-250 bg-slate-50/50 py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>


          {oilDataLoading ? (
            <div className="h-96 flex items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : !oilData || oilData.length === 0 ? (
            <div className="h-96 flex items-center justify-center text-slate-400 text-sm border border-dashed rounded-2xl bg-white">
              No sample data found. Please ingest Oil Composition data.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Dataset Records Table (Default Collapsed at Top) */}
              <DashboardDatasetTable
                title="Oil Composition Dataset Records"
                data={oilData}
                variables={oilDataset?.variables}
                isLoading={oilDataLoading}
              />

              {activeTab === 'scientific' && (
                <>
                  {hasVariable('api_gravity') && hasVariable('interval_top') && (
                    <Card className="border border-slate-200 shadow-sm overflow-hidden flex flex-col rounded-2xl bg-white" noPadding>
                      <div className="border-b border-slate-100 p-5 pb-3 flex justify-center text-center">
                        <div className="inline-block border border-slate-200/80 px-4 py-1.5 rounded-lg bg-slate-50/50 shadow-2xs">
                          <h4 className="text-base font-bold text-slate-800 tracking-tight text-center">API Gravity vs Depth</h4>
                        </div>
                      </div>
                      <div className="p-5">
                        <DynamicPlotlyChart
                          chartType="api_vs_depth"
                          data={apiVsDepthPoints}
                          xLabel="API (°API)"
                          yLabel="Depth (m)"
                          colorByLabel="Well Name"
                          title="API Gravity vs Depth"
                          onPointClick={setSelectedPoint}
                        />
                      </div>
                    </Card>
                  )}
                </>
              )}

              {activeTab === 'builder' && (
                <Card
                  title="Interactive Custom Chart Builder"
                  className="border border-slate-200 shadow-sm bg-white p-5 rounded-2xl"
                >
                  {/* Variables and Chart selectors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/50 mb-6">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">X Axis Variable</label>
                      <select
                        value={xVar}
                        onChange={(e) => setXVar(e.target.value)}
                        className="w-full text-xs rounded-lg border-slate-200 bg-white py-1.5 px-2.5 font-semibold text-slate-700 focus:ring-2 focus:ring-ongc-blue"
                      >
                        {variables.map((v) => (
                          <option key={v.id} value={v.sql_column_name}>
                            {v.display_name} {v.display_unit ? `(${v.display_unit})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {chartType !== 'correlation_matrix' && chartType !== 'histogram' && (
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Y Axis Variable</label>
                        <select
                          value={yVar}
                          onChange={(e) => setYVar(e.target.value)}
                          className="w-full text-xs rounded-lg border-slate-200 bg-white py-1.5 px-2.5 font-semibold text-slate-700 focus:ring-2 focus:ring-ongc-blue"
                        >
                          <option value="">None (Histogram count)</option>
                          {numericVars.map((v) => (
                            <option key={v.id} value={v.sql_column_name}>
                              {v.display_name} {v.display_unit ? `(${v.display_unit})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {chartType !== 'correlation_matrix' && (
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Color / Series By</label>
                        <select
                          value={colorBy}
                          onChange={(e) => setColorBy(e.target.value)}
                          className="w-full text-xs rounded-lg border-slate-200 bg-white py-1.5 px-2.5 font-semibold text-slate-700 focus:ring-2 focus:ring-ongc-blue"
                        >
                          <option value="">None</option>
                          {categoricalVars.map((v) => (
                            <option key={v.id} value={v.sql_column_name}>
                              {v.display_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Chart Type</label>
                      <select
                        value={chartType}
                        onChange={(e) => setChartType(e.target.value)}
                        className="w-full text-xs rounded-lg border-slate-200 bg-white py-1.5 px-2.5 font-semibold text-slate-700 focus:ring-2 focus:ring-ongc-blue"
                      >
                        <option value="scatter">Scatter Plot</option>
                        <option value="line">Line Graph</option>
                        <option value="bar">Bar Chart</option>
                        <option value="boxplot">Box Plot</option>
                        <option value="area">Area Plot</option>
                        <option value="histogram">Histogram</option>
                      </select>
                    </div>
                  </div>

                  {/* Plotly Canvas */}
                  {chartLoading ? (
                    <div className="h-[500px] flex items-center justify-center">
                      <Spinner size="lg" />
                    </div>
                  ) : (
                    <div className="h-[500px]">
                      <DynamicPlotlyChart
                        chartType={chartType}
                        data={chartData || []}
                        xLabel={xVar}
                        yLabel={yVar}
                        colorByLabel={colorBy || undefined}
                        title={yVar ? `${variables.find(v => v.sql_column_name === xVar)?.display_name || xVar} vs ${variables.find(v => v.sql_column_name === yVar)?.display_name || yVar}` : `${variables.find(v => v.sql_column_name === xVar)?.display_name || xVar} Distribution`}
                      />
                    </div>
                  )}
                </Card>
              )}

              
            </div>
          )}

      {/* ── POINT DETAILS MODAL ── */}
      {selectedPoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">Sample Details</h3>
              <button
                onClick={() => setSelectedPoint(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(selectedPoint)
                  .filter(([key]) => !['x', 'y', 'z', 'color_by', 'chart_id'].includes(key))
                  .map(([key, val]) => {
                    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <div key={key} className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wide">
                          {label}
                        </span>
                        <p className="text-xs font-semibold text-slate-800">
                          {val !== null && val !== undefined ? String(val) : '—'}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedPoint(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition-all"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
