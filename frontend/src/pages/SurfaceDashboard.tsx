import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Database, Layers, Filter, RefreshCw, BarChart2, CheckSquare, Square, Search, FileText, Download, Activity, AlertTriangle } from 'lucide-react';
import { Card } from '../components/common/Card';
import { KpiCard } from '../components/common/KpiCard';
import { Spinner } from '../components/common/Spinner';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { formatNumber } from '../utils/formatters';
import { DynamicPlotlyChart } from '../components/charts/DynamicPlotlyChart';
import api from '../services/api';
import { reportsService } from '../services/reports.service';
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

export const SurfaceDashboard: React.FC = () => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [searchParams] = useSearchParams();
  const datasetParam = searchParams.get('dataset') || 'microbiology';

  // Custom builder states
  const [xVar, setXVar] = useState<string>('');
  const [yVar, setYVar] = useState<string>('');
  const [colorBy, setColorBy] = useState<string>('');
  const [chartType, setChartType] = useState<string>('scatter');

  // Filters state
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [activeFiltersCount, setActiveFiltersCount] = useState<number>(0);
  const [showFilters, setShowFilters] = useState<boolean>(true);

  // Search filter options inside search boxes
  const [filterSearches, setFilterSearches] = useState<Record<string, string>>({});

  // Tabs state
  const [activeTab, setActiveTab] = useState<'scientific' | 'builder'>('builder');

  // pagination and sorting state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [sortBy, setSortBy] = useState<string>('id');
  const [sortDesc, setSortDesc] = useState(false);

  // 1. Fetch Datasets
  const { data: datasets, isLoading: datasetsLoading } = useQuery<DatasetDef[]>({
    queryKey: ['datasets'],
    queryFn: () => api.get<DatasetDef[]>('/datasets').then((res) => res.data),
  });

  const surfaceDataset = datasets?.find((d) => d.name === datasetParam);

  useEffect(() => {
    if (surfaceDataset) {
      setSelectedDatasetId(surfaceDataset.id);
    }
  }, [surfaceDataset]);

  // Set default axes when variables load
  useEffect(() => {
    if (surfaceDataset?.variables) {
      const numericVars = surfaceDataset.variables.filter((v) => v.is_numeric);
      if (numericVars.length >= 2) {
        setXVar(numericVars[0].sql_column_name);
        setYVar(numericVars[1].sql_column_name);
      } else if (numericVars.length === 1) {
        setXVar(numericVars[0].sql_column_name);
        setYVar('');
      }
    }
  }, [surfaceDataset]);

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
    Object.values(filters).forEach((val) => {
      if (Array.isArray(val)) {
        count += val.length;
      } else if (val && (val.min !== undefined || val.max !== undefined)) {
        if (val.min !== '' || val.max !== '') {
          count += 1;
        }
      }
    });
    setActiveFiltersCount(count);
    setPage(1); // reset to first page when filters change
  }, [filters]);

  const handleResetFilters = () => {
    setFilters({});
    setFilterSearches({});
  };

  const toggleMultiSelect = (key: string, val: string) => {
    setFilters((prev) => {
      const current = prev[key] || [];
      const updated = current.includes(val)
        ? current.filter((item: string) => item !== val)
        : [...current, val];
      
      const copy = { ...prev };
      if (updated.length === 0) {
        delete copy[key];
      } else {
        copy[key] = updated;
      }
      return copy;
    });
  };

  const handleRangeChange = (key: string, field: 'min' | 'max', val: string) => {
    setFilters((prev) => {
      const current = prev[key] || {};
      const numVal = val === '' ? undefined : parseFloat(val);
      const updated = { ...current, [field]: numVal };

      const copy = { ...prev };
      if (updated.min === undefined && updated.max === undefined) {
        delete copy[key];
      } else {
        copy[key] = updated;
      }
      return copy;
    });
  };

  // Compile filters query parameters for backend
  const serializedFilters = React.useMemo(() => {
    const params: Record<string, any> = {};
    Object.entries(filters).forEach(([key, val]) => {
      if (Array.isArray(val)) {
        params[key] = val.join(',');
      } else if (val) {
        if (val.min !== undefined) params[`${key}_min`] = val.min;
        if (val.max !== undefined) params[`${key}_max`] = val.max;
      }
    });
    return JSON.stringify(params);
  }, [filters]);

  // 3. Fetch KPI Stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats-dynamic-surface', selectedDatasetId, serializedFilters],
    queryFn: () =>
      api.get<{
        total_samples: number;
        kpis: { name: string; avg: number; min: number; max: number }[];
      }>('/dashboard/stats', {
        params: {
          dataset_id: selectedDatasetId,
          filters: serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  // 4. Fetch Records list
  const { data: recordsData, isLoading: recordsLoading, refetch: refetchRecords } = useQuery({
    queryKey: ['dashboard-records-dynamic-surface', selectedDatasetId, serializedFilters, page, pageSize, sortBy, sortDesc],
    queryFn: () =>
      api.get<{
        total: number;
        items: any[];
      }>(`/datasets/${selectedDatasetId}/records`, {
        params: {
          skip: (page - 1) * pageSize,
          limit: pageSize,
          sort_by: sortBy,
          sort_desc: sortDesc,
          ...JSON.parse(serializedFilters),
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  const records = recordsData?.items || [];
  const totalRecords = recordsData?.total || 0;

  // 5. Fetch Custom Chart Builder Data
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ['custom-chart-data-surface', selectedDatasetId, serializedFilters, xVar, yVar, colorBy, chartType],
    queryFn: () =>
      api.get<any[]>('/dashboard/scientific-plots', {
        params: {
          dataset_id: selectedDatasetId,
          plot_type: 'custom',
          x_var: xVar,
          y_var: yVar || undefined,
          color_by: colorBy || undefined,
          chart_type: chartType,
          filters: serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId && !!xVar && !!chartType,
  });

  const handleRefreshAll = () => {
    refetchRecords();
  };

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

  const variables = surfaceDataset?.variables || [];
  const numericVars = variables.filter((v) => v.is_numeric);

  const formatParamLabel = (str: string) => {
    return str
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Datasets Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <Badge
            label={surfaceDataset?.display_name || 'Microbiology'}
            variant="custom"
            customColor="bg-emerald-100 text-emerald-850 border-emerald-200"
            size="md"
          />
          <span className="text-xs text-slate-400 font-semibold font-mono">
            {surfaceDataset?.sql_table_name}
          </span>
        </div>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <Card key={idx} className="h-24 animate-pulse bg-slate-50 border-slate-100">
              <div className="h-12" />
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              title="Total Samples"
              value={formatNumber(stats?.total_samples || totalRecords)}
              description="Registered observations"
              accentColorClass="border-l-ongc-blue"
            />
            <KpiCard
              title="Active Locations"
              value={metadata?.filter_options?.location?.length || 0}
              description="Sample coordinate points"
              accentColorClass="border-l-amber-500"
            />
            <KpiCard
              title="Microbiology Indicators"
              value={numericVars.length}
              description="Configured numeric variables"
              accentColorClass="border-l-emerald-500"
            />
          </>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
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
      </div>

      {/* Filters & Visualizations Side-by-Side */}
      <div className={`grid grid-cols-1 ${showFilters ? 'lg:grid-cols-4' : ''} gap-6`}>
        {/* Left Side: Collapsible Filters */}
        <Card className={`${showFilters ? 'lg:col-span-1' : 'w-full'} border border-slate-200/60 shadow-xs h-fit`} noPadding>
          <div
            className={`flex items-center justify-between cursor-pointer px-6 py-4 ${
              showFilters ? 'border-b border-slate-100' : ''
            }`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Filter className="w-4 h-4 text-ongc-blue" />
              <span>REGISTRY FILTERS</span>
              {activeFiltersCount > 0 && (
                <span className="bg-amber-100 text-amber-800 border-amber-200 text-[9px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                  {activeFiltersCount} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {activeFiltersCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetFilters();
                  }}
                  className="text-[10px] font-bold text-slate-405 hover:text-ongc-blue transition-colors"
                >
                  Clear All
                </button>
              )}
              <span className="text-xs font-bold text-slate-500 hover:text-slate-800 select-none">
                {showFilters ? 'Hide Filters ˄' : 'Show Filters ˅'}
              </span>
            </div>
          </div>

          {showFilters && (
            <div className="p-6 space-y-6">
              {/* Categorical Filters */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-1.5">
                  Categorical Filters
                </h3>
                {metadata?.filter_options &&
                  Object.entries(metadata.filter_options)
                    .filter(([key]) =>
                      ['formation', 'location', 'ubhi', 'insert_user', 'remarks'].includes(key)
                    )
                    .map(([key, opts]) => {
                      const searchVal = filterSearches[key] || '';
                      const filteredOpts = (opts || []).filter((o) =>
                        o.toLowerCase().includes(searchVal.toLowerCase())
                      );
                      const checkedOpts = filters[key] || [];

                      return (
                        <div key={key} className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                            {formatParamLabel(key === 'name' ? 'Well Name' : key)}
                          </label>

                          {/* Inner Search Box */}
                          {opts.length > 5 && (
                            <div className="relative">
                              <input
                                type="text"
                                placeholder={`Search ${formatParamLabel(
                                  key === 'name' ? 'Well Name' : key
                                )}...`}
                                value={searchVal}
                                onChange={(e) =>
                                  setFilterSearches((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                className="w-full text-[11px] rounded-lg border-slate-200 bg-slate-50/50 py-1 pl-6 pr-2 focus:ring-1 focus:ring-ongc-blue"
                              />
                              <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                            </div>
                          )}

                          <div className="max-h-24 overflow-y-auto space-y-1.5 pt-1 pl-1 border border-slate-100 rounded-lg p-1.5 bg-slate-50/20">
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
              </div>

              {/* Numeric Bound Filters */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-1.5">
                  Numeric Bounds
                </h3>
                <div className="max-h-80 overflow-y-auto space-y-4 pr-1">
                  {metadata?.filter_ranges &&
                    Object.entries(metadata.filter_ranges).map(([key, range]) => {
                      const current = filters[key] || {};
                      return (
                        <div key={key} className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 block truncate font-mono">
                            {formatParamLabel(key)}
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              placeholder={`Min: ${range.min.toFixed(2)}`}
                              value={current.min === undefined ? '' : current.min}
                              onChange={(e) =>
                                handleRangeChange(key, 'min', e.target.value)
                              }
                              className="w-1/2 text-xs rounded-lg border-slate-200 py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                            />
                            <span className="text-slate-400 text-xs">-</span>
                            <input
                              type="number"
                              placeholder={`Max: ${range.max.toFixed(2)}`}
                              value={current.max === undefined ? '' : current.max}
                              onChange={(e) =>
                                handleRangeChange(key, 'max', e.target.value)
                              }
                              className="w-1/2 text-xs rounded-lg border-slate-200 py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Right Side: Tab Contents */}
        <div className={`lg:col-span-${showFilters ? '3' : '4'} space-y-6`}>
          {/* TAB 1: Chart Builder */}
          {activeTab === 'builder' && (
            <Card
              title="Interactive Geochemical Chart Builder"
              className="p-6 border border-slate-200 bg-white rounded-2xl shadow-sm space-y-6"
            >
              {/* Builder Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-slate-50 border rounded-xl">
                {/* X Axis select */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    X-Axis Variable
                  </label>
                  <select
                    value={xVar}
                    onChange={(e) => setXVar(e.target.value)}
                    className="w-full text-xs rounded-lg border-slate-250 bg-white py-1.5 px-3 focus:ring-1 focus:ring-indigo-600 font-semibold text-slate-700"
                  >
                    {numericVars.map((v) => (
                      <option key={v.sql_column_name} value={v.sql_column_name}>
                        {v.display_name} {v.display_unit ? `(${v.display_unit})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Y Axis select */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    Y-Axis Variable
                  </label>
                  <select
                    value={yVar}
                    onChange={(e) => setYVar(e.target.value)}
                    className="w-full text-xs rounded-lg border-slate-250 bg-white py-1.5 px-3 focus:ring-1 focus:ring-indigo-600 font-semibold text-slate-700"
                  >
                    <option value="">None (Histogram / Distribution)</option>
                    {numericVars.map((v) => (
                      <option key={v.sql_column_name} value={v.sql_column_name}>
                        {v.display_name} {v.display_unit ? `(${v.display_unit})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Color By select */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    Color By / Legend
                  </label>
                  <select
                    value={colorBy}
                    onChange={(e) => setColorBy(e.target.value)}
                    className="w-full text-xs rounded-lg border-slate-250 bg-white py-1.5 px-3 focus:ring-1 focus:ring-indigo-600 font-semibold text-slate-700"
                  >
                    <option value="">None</option>
                    <option value="ubhi">UBHI</option>
                    <option value="formation">Formation</option>
                  </select>
                </div>

                {/* Chart Type select */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    Chart Layout
                  </label>
                  <select
                    value={chartType}
                    onChange={(e) => setChartType(e.target.value)}
                    className="w-full text-xs rounded-lg border-slate-250 bg-white py-1.5 px-3 focus:ring-1 focus:ring-indigo-600 font-semibold text-slate-700"
                  >
                    <option value="scatter">Bivariate Scatter</option>
                    <option value="line">Line Plot</option>
                    <option value="histogram">Histogram / Frequency</option>
                  </select>
                </div>
              </div>

              {/* Builder Plotly Display */}
              {chartLoading ? (
                <div className="h-80 flex items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <div className="h-[500px]">
                  <DynamicPlotlyChart
                    chartType={chartType}
                    data={chartData || []}
                    xLabel={xVar}
                    yLabel={yVar}
                    colorByLabel={colorBy || undefined}
                    title={
                      yVar
                        ? `${
                            variables.find((v) => v.sql_column_name === xVar)?.display_name || xVar
                          } vs ${
                            variables.find((v) => v.sql_column_name === yVar)?.display_name || yVar
                          }`
                        : `${
                            variables.find((v) => v.sql_column_name === xVar)?.display_name || xVar
                          } Distribution`
                    }
                  />
                </div>
              )}
            </Card>
          )}

          {/* TAB 2: Scientific Plots Falling Back */}
          {activeTab === 'scientific' && (
            <Card className="p-6 bg-white border border-slate-200 shadow-sm rounded-2xl">
              <div className="h-80 flex flex-col items-center justify-center text-slate-400 italic text-sm gap-2">
                <Activity className="w-12 h-12 text-slate-300" />
                <span>Geochemical classification plot for Microbiology is under development.</span>
                <span className="text-[11px] font-normal text-slate-400 not-italic">
                  Please use the Chart Builder tab to plot variables in 2D scatter plots.
                </span>
              </div>
            </Card>
          )}

          {/* Records Table Section */}
          <DashboardDatasetTable
            title="Microbiology Dataset Records"
            data={records}
            variables={variables}
            isLoading={recordsLoading}
          />
        </div>
      </div>
    </div>
  );
};
