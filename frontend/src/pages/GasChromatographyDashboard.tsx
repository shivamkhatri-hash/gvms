import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Layers, Filter, RefreshCw, BarChart2, CheckSquare, Square, Search, Sliders, FileText, Download, Activity } from 'lucide-react';
import { Card } from '../components/common/Card';
import { KpiCard } from '../components/common/KpiCard';
import { Spinner } from '../components/common/Spinner';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { formatNumber } from '../utils/formatters';
import { DynamicPlotlyChart } from '../components/charts/DynamicPlotlyChart';
import { DashboardDatasetTable } from '../components/common/DashboardDatasetTable';
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

export const GasChromatographyDashboard: React.FC = () => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);
  
  // Custom builder states
  const [xVar, setXVar] = useState<string>('nc17');
  const [yVar, setYVar] = useState<string>('pr');
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

  const gcDataset = datasets?.find((d) => d.name === 'gas_chromatography');

  useEffect(() => {
    if (gcDataset) {
      setSelectedDatasetId(gcDataset.id);
    }
  }, [gcDataset]);

  // 2. Fetch Metadata filters options
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

  // 5. Fetch All Filtered GC Records for Scientific Dashboard
  const { data: gcData, isLoading: gcDataLoading, refetch: refetchGC } = useQuery<any[]>({
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
    refetchGC();
  };

  // Pristane/nC17 vs Phytane/nC18 scientific points mapping (declared before early returns to satisfy React rules of hooks)
  const prPhCrossPoints = React.useMemo(() => {
    if (!gcData || !Array.isArray(gcData)) return [];
    return gcData
      .map((d) => {
        const xVal = d.ph_by_nc18;
        const yVal = d.pr_by_nc17;
        
        if (xVal === undefined || xVal === null || isNaN(parseFloat(xVal)) ||
            yVal === undefined || yVal === null || isNaN(parseFloat(yVal))) {
          return null;
        }

        return {
          ...d, // Attach complete database columns for tooltips & click handlers
          x: parseFloat(xVal),
          y: parseFloat(yVal),
          color_by: d.name || 'N/A' // Well name column in DL_GAS_CHROMATOGRAPHY is 'name'
        };
      })
      .filter((p) => p !== null);
  }, [gcData]);

  // State for tabs
  const [activeTab, setActiveTab] = useState<'scientific' | 'builder'>('scientific');
  const [selectedSampleId, setSelectedSampleId] = useState<string>('');

  // Reports export helper
  const handleExport = async (format: 'pdf' | 'excel' | 'csv') => {
    if (!selectedDatasetId) return;
    try {
      await reportsService.downloadReport(format, selectedDatasetId, serializedFilters);
    } catch (err) {
      alert('Report download failed.');
    }
  };

  if (datasetsLoading || !selectedDatasetId) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Get lists of options
  const variables = gcDataset?.variables || [];
  const numericVars = variables.filter((v) => v.is_numeric);
  const categoricalVars = variables.filter((v) => !v.is_numeric && !v.is_calculated);

  const hasVariable = (colName: string) => {
    return variables.some(v => v.sql_column_name === colName);
  };



  // Generate Carbon profile options
  const sampleOptions = (gcData || []).map((s, idx) => ({
    id: s.id ? String(s.id) : String(idx),
    label: `Well: ${s.name || 'N/A'} | Object: ${s.object_number || 'N/A'} | Depth: ${s.interval_top || 0}-${s.interval_bottom || 0} m`,
    data: s
  }));

  // Pristane/nC17 vs Phytane/nC18 scientific points mapping is now declared at the top level

  // Auto select first sample
  if (sampleOptions.length > 0 && !selectedSampleId) {
    setSelectedSampleId(sampleOptions[0].id);
  }

  const selectedSampleData = sampleOptions.find(opt => opt.id === selectedSampleId)?.data;
  const carbonProfilePoints: any[] = [];
  if (selectedSampleData) {
    for (let i = 10; i <= 40; i++) {
      const val = parseFloat(selectedSampleData[`nc${i}`]);
      carbonProfilePoints.push({ x: `n-C${i}`, y: isNaN(val) ? 0 : val });
    }
  }

  // Carbon distribution boxplot data
  const carbonDistributionPoints: any[] = [];
  if (gcData && gcData.length > 0) {
    gcData.forEach(row => {
      for (let i = 10; i <= 40; i++) {
        const val = parseFloat(row[`nc${i}`]);
        if (!isNaN(val)) {
          carbonDistributionPoints.push({ x: `n-C${i}`, y: val });
        }
      }
    });
  }

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
              title="Total GC Samples"
              value={formatNumber(stats?.total_records || 0)}
              description="Active observation values"
              accentColorClass="border-l-ongc-blue"
            />

            {/* KPI 2: Average Pr/Ph */}
            <KpiCard
              title="Avg Pr/Ph Ratio"
              value={stats?.kpis?.find((k: any) => k.name === 'pr_by_ph')?.avg?.toFixed(2) || '0.00'}
              description={`Range: ${stats?.kpis?.find((k: any) => k.name === 'pr_by_ph')?.min?.toFixed(2) || '0.00'} - ${stats?.kpis?.find((k: any) => k.name === 'pr_by_ph')?.max?.toFixed(2) || '0.00'}`}
              accentColorClass="border-l-amber-500"
            />

            {/* KPI 3: Max C_Max */}
            <KpiCard
              title="Top Concentration (C_Max)"
              value={`n-C${stats?.kpis?.find((k: any) => k.name === 'c_max')?.max?.toFixed(0) || '0'}`}
              description="Most prevalent carbon peak"
              accentColorClass="border-l-emerald-500"
            />

            {/* KPI 4: Active Locations */}
            <KpiCard
              title="Active Formations"
              value={metadata?.filter_options?.formation?.length || 0}
              description={`Across ${metadata?.filter_options?.location?.length || 0} testing locations`}
              accentColorClass="border-l-purple-500"
            />
          </>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="hidden border-b border-slate-200">
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
      <Card className="bg-slate-50/50 border-slate-200 shadow-xs" noPadding>
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
                .filter(([key]) => ['formation', 'location', 'material_type', 'name', 'object_number', 'ubhi', 'analysis_date'].includes(key))
                .map(([key, opts]) => {
                  const searchVal = filterSearches[key] || '';
                  const filteredOpts = (opts || []).filter((o) =>
                    o.toLowerCase().includes(searchVal.toLowerCase())
                  );
                  const checkedOpts = filters[key] || [];

                  return (
                    <div key={key} className="space-y-1.5 p-2.5 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                        {formatParamLabel(key === 'name' ? 'Well Name' : key)}
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

      {/* Tab Contents */}
      <div className="space-y-6">
          {activeTab === 'scientific' && (
            <div className="space-y-8">
              {gcDataLoading ? (
                <div className="h-96 flex items-center justify-center">
                  <Spinner size="lg" />
                </div>
              ) : !gcData || gcData.length === 0 ? (
                <div className="h-96 flex items-center justify-center text-slate-400 text-sm border border-dashed rounded-2xl bg-white">
                  No sample data found. Please ingest Gas Chromatography data.
                </div>
              ) : (
                <div className="space-y-6">
                  <Card className="border border-slate-200 shadow-sm overflow-hidden flex flex-col rounded-2xl bg-white" noPadding>
                    <div className="border-b border-slate-100 p-5 pb-3">
                      <h4 className="text-sm font-bold text-slate-800">Pristane/nC17 vs Phytane/nC18</h4>
                    </div>
                    <div className="p-5">
                      <DynamicPlotlyChart
                        chartType="pr_nc17_vs_ph_nc18"
                        data={prPhCrossPoints}
                        xLabel="Phytane / nC18"
                        yLabel="Pristane / nC17"
                        colorByLabel="Well No."
                        title="Pristane/nC17 vs Phytane/nC18"
                        onPointClick={setSelectedPoint}
                        height="h-[850px]"
                      />
                    </div>
                  </Card>

                  <DashboardDatasetTable
                    title="Gas Chromatography Dataset Records"
                    data={gcData}
                    variables={gcDataset?.variables}
                    isLoading={gcDataLoading}
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'builder' && (
            <Card
              title="Interactive Custom Chart Builder"
              className="border border-slate-200 shadow-sm"
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
                    <option value="correlation_matrix">Heatmap (Correlation Matrix)</option>
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
                    title={yVar ? `${gcDataset?.variables?.find(v => v.sql_column_name === xVar)?.display_name || xVar} vs ${gcDataset?.variables?.find(v => v.sql_column_name === yVar)?.display_name || yVar}` : `${gcDataset?.variables?.find(v => v.sql_column_name === xVar)?.display_name || xVar} Distribution`}
                  />
                </div>
              )}
            </Card>
          )}


        </div>
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
                    let label = key;
                    if (key === 'name') label = 'Well No.';
                    else if (key === 'object_number') label = 'Obj';
                    else if (key === 'pr_by_ph') label = 'Pr/Ph';
                    else if (key === 'pr_by_nc17') label = 'Pr/nC17';
                    else if (key === 'ph_by_nc18') label = 'Ph/nC18';
                    else label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                    
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
                className="px-4 py-2 bg-slate-200 hover:bg-slate-350 text-slate-800 rounded-lg text-xs font-bold transition-all"
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
