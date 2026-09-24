import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Layers, Filter, BarChart2, CheckSquare, Square, Search, FileText, Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card } from '../components/common/Card';
import { KpiCard } from '../components/common/KpiCard';
import { applyGlobalLayoutDefaults } from '../utils/plotlyConfig';
import { Spinner } from '../components/common/Spinner';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { DynamicPlotlyChart } from '../components/charts/DynamicPlotlyChart';
import { CustomPlot as Plot } from '../components/charts/CustomPlot';
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

export const TricyclicDashboard: React.FC = () => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  
  // Custom builder states
  const [xVar, setXVar] = useState<string>('depth');
  const [yVar, setYVar] = useState<string>('total');
  const [colorBy, setColorBy] = useState<string>('');
  const [chartType, setChartType] = useState<string>('scatter');

  // Filters state
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [activeFiltersCount, setActiveFiltersCount] = useState<number>(0);
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Search filter options inside search boxes
  const [filterSearches, setFilterSearches] = useState<Record<string, string>>({});

  // Tabs state
  const [activeTab, setActiveTab] = useState<'scientific' | 'builder'>('scientific');

  // 1. Fetch Datasets
  const { data: datasets, isLoading: datasetsLoading } = useQuery<DatasetDef[]>({
    queryKey: ['datasets'],
    queryFn: () => api.get<DatasetDef[]>('/datasets').then((res) => res.data),
  });

  const tricyclicDataset = datasets?.find((d) => d.name === 'tricyclic_terpane');

  useEffect(() => {
    if (tricyclicDataset) {
      setSelectedDatasetId(tricyclicDataset.id);
    }
  }, [tricyclicDataset]);

  // Set default axes when variables load
  useEffect(() => {
    if (tricyclicDataset?.variables) {
      const numericVars = tricyclicDataset.variables.filter((v) => v.is_numeric);
      if (numericVars.length >= 2) {
        setXVar(numericVars[0].sql_column_name);
        setYVar(numericVars[1].sql_column_name);
      }
    }
  }, [tricyclicDataset]);

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

  // 5. Fetch All Filtered Tricyclic Records for Scientific Dashboard
  const { data: tricyclicData, isLoading: tricyclicDataLoading, refetch: refetchTricyclic } = useQuery<any[]>({
    queryKey: ['scientific-plots-data-tricyclic', selectedDatasetId, serializedFilters],
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
    refetchTricyclic();
  };

  // Export report with direct on-screen Plotly graph snapshots
  const handleExportPDF = async () => {
    if (!selectedDatasetId) return;
    try {
      await reportsService.downloadReportWithSnapshots(selectedDatasetId, serializedFilters);
    } catch (err) {
      console.error('Failed to export PDF:', err);
    }
  };



  // Generate Plotly traces for TT / TeT Ratio Plot
  const renderTTRatioTraces = (validData: any[]) => {
    const variables = [
      { field: 'perc_c19tt', name: '% C19 TT' },
      { field: 'perc_c20tt', name: '% C20 TT' },
      { field: 'perc_c21tt', name: '% C21 TT' },
      { field: 'perc_c22tt', name: '% C22 TT' },
      { field: 'perc_c23tt', name: '% C23 TT' },
      { field: 'perc_c24tt', name: '% C24 TT' },
      { field: 'perc_c25tt_r', name: '% C25 TT_R' },
      { field: 'perc_c25tt_s', name: '% C25 TT_S' },
      { field: 'perc_c24tet', name: '% C24TET' },
      { field: 'perc_c26tt_r', name: '% C26 TT_R' },
      { field: 'perc_c26tt_s', name: '% C26TT_S' }
    ];

    const wellMap: Record<string, Record<string, number>> = {};
    validData.forEach(row => {
      const well = row.name || 'Unknown';
      if (!wellMap[well]) {
        wellMap[well] = {};
      }
      variables.forEach(v => {
        const val = parseFloat(row[v.field]);
        if (!isNaN(val)) {
          wellMap[well][v.field] = val;
        }
      });
    });

    const wells = Object.keys(wellMap);
    
    return variables.map(v => {
      const yValues = wells.map(w => wellMap[w][v.field] !== undefined ? wellMap[w][v.field] : null);
      return {
        x: wells,
        y: yValues,
        mode: 'lines+markers',
        name: v.name,
        line: { width: 2 },
        marker: { size: 6 }
      };
    });
  };

  const getCommonLayout = (title: string, xTitle: string, yTitle: string, isCategoricalX = false) => {
    return applyGlobalLayoutDefaults({
      title: {
        text: title,
        font: { size: 14, color: '#1e293b', family: 'Inter, sans-serif', weight: 'bold' as any }
      },
      xaxis: {
        title: { text: xTitle },
        type: isCategoricalX ? ('category' as any) : undefined,
        gridcolor: '#f1f5f9',
        zerolinecolor: '#000000',
        tickfont: { size: 11, color: '#475569' },
        showline: true,
        mirror: true,
        linecolor: '#000000',
        linewidth: 2
      },
      yaxis: {
        title: { text: yTitle },
        gridcolor: '#f1f5f9',
        zerolinecolor: '#000000',
        tickfont: { size: 11, color: '#475569' },
        showline: true,
        mirror: true,
        linecolor: '#000000',
        linewidth: 2
      },
      plot_bgcolor: '#ffffff',
      paper_bgcolor: '#ffffff',
      margin: { l: 60, r: 30, t: 50, b: 100 },
      hovermode: 'closest' as any,
      showlegend: true,
      legend: {
        orientation: 'h' as any,
        x: 0.5,
        y: -0.22,
        xanchor: 'center',
        yanchor: 'top',
        font: { size: 10, color: '#475569', family: 'Inter, sans-serif' },
        bordercolor: '#cbd5e1',
        borderwidth: 1
      }
    });
  };



  if (datasetsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!tricyclicDataset) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
            <h3 className="text-red-800 font-bold">Tricyclic Terpane Dataset Not Registered</h3>
          </div>
          <p className="text-red-700 text-sm mt-2">
            Please run the database migrations and check the backend container startup seeding logs to register the dataset.
          </p>
        </div>
      </div>
    );
  }

  // Extracted lists for filter display
  const numericVars = tricyclicDataset.variables.filter((v) => v.is_numeric);
  const categoricalVars = tricyclicDataset.variables.filter((v) => !v.is_numeric && !['id', 'remarks', 'analysed_at', 'insert_user', 'insert_date', 'update_user', 'update_date', 'uploaded_by'].includes(v.sql_column_name));

  // Filters required: UBHI, NAME, DEPTH, TOTAL, C19, C20, C21, C22, C23, C24, C25R, C25S, C26R, C26S, Date. We map to view columns
  const filterRangesToRender = ['depth', 'total', 'c19tt', 'c20tt', 'c21tt', 'c22tt', 'c23tt', 'c24tt', 'c25tt_r', 'c25tt_s', 'c26tt_r', 'c26tt_s'];

  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* Collapsible Filters Card */}
      <Card className="bg-slate-50/50 border-slate-200 shadow-xs" noPadding>
        <div className={`flex items-center justify-between cursor-pointer p-6 ${showFilters ? 'border-b border-slate-200' : ''}`} onClick={() => setShowFilters(!showFilters)}>
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
            {/* Generate dynamic categorical filters */}
            {categoricalVars.map((v) => {
              const col = v.sql_column_name;
              const options = metadata?.filter_options?.[col] || [];
              const searchVal = filterSearches[col] || '';
              const filteredOptions = options.filter(opt => opt.toLowerCase().includes(searchVal.toLowerCase()));

              return (
                <div key={col} className="space-y-1.5 p-2.5 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                    {v.display_name}
                  </label>
                  {options.length > 5 && (
                    <div className="relative mb-2">
                      <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder={`Search...`}
                        value={searchVal}
                        onChange={(e) => setFilterSearches(prev => ({ ...prev, [col]: e.target.value }))}
                        className="w-full text-xs rounded-lg border-slate-250 bg-slate-50/50 py-1 pl-6 pr-2 focus:ring-1 focus:ring-ongc-blue text-slate-800"
                      />
                    </div>
                  )}
                  <div className="max-h-24 overflow-y-auto space-y-1.5 pt-1 pl-1 flex-1">
                    {filteredOptions.length === 0 ? (
                      <span className="text-[10px] text-slate-400 italic block">No options</span>
                    ) : (
                      filteredOptions.map((opt) => {
                        const isChecked = filters[col]?.includes(opt) || false;
                        return (
                          <div
                            key={opt}
                            onClick={() => toggleMultiSelect(col, opt)}
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

            {/* Range filters */}
            {filterRangesToRender.map((col) => {
              const v = tricyclicDataset.variables.find((x) => x.sql_column_name === col);
              if (!v) return null;
              const range = metadata?.filter_ranges?.[col];
              const minLimit = range?.min !== undefined ? Math.floor(range.min) : 0;
              const maxLimit = range?.max !== undefined ? Math.ceil(range.max) : 1000;
              
              const currentMin = filters[col]?.min !== undefined ? filters[col].min : '';
              const currentMax = filters[col]?.max !== undefined ? filters[col].max : '';

              return (
                <div key={col} className="space-y-1.5 p-2.5 bg-white border border-slate-100 rounded-xl shadow-3xs">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                    {v.display_name} {v.display_unit ? `(${v.display_unit})` : ''}
                  </label>
                  <div className="flex gap-2">
                    <div className="w-1/2">
                      <label className="text-[9px] text-slate-400 block">Min Bound</label>
                      <input
                        type="number"
                        placeholder={minLimit.toString()}
                        value={currentMin}
                        onChange={(e) => handleRangeChange(col, 'min', e.target.value)}
                        className="w-full text-xs rounded-lg border-slate-250 bg-slate-50/50 py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                      />
                    </div>
                    <div className="w-1/2">
                      <label className="text-[9px] text-slate-400 block">Max Bound</label>
                      <input
                        type="number"
                        placeholder={maxLimit.toString()}
                        value={currentMax}
                        onChange={(e) => handleRangeChange(col, 'max', e.target.value)}
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

      {/* Main Dashboard Space */}
      <div className="space-y-6 w-full">

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
              variant="outline"
              size="sm"
              icon={<FileText className="w-3.5 h-3.5" />}
              onClick={handleExportPDF}
            >
              Export Report
            </Button>
          </div>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* KPI 1: Samples count */}
          <KpiCard
            title="Total Samples"
            value={statsLoading ? '...' : stats?.total_samples || 0}
            description="Ingested records"
            accentColorClass="border-l-ongc-blue"
          />

          {/* KPI 2: Unique Wells */}
          <KpiCard
            title="Unique Wells"
            value={statsLoading ? '...' : stats?.total_wells || 0}
            description="Unique boreholes"
            accentColorClass="border-l-amber-500"
          />

          {/* KPI 3: Registered Variables */}
          <KpiCard
            title="Registered Variables"
            value={tricyclicDataset?.variables.length || 0}
            description="Active variables"
            accentColorClass="border-l-emerald-500"
          />

          {/* KPI 4: Dataset View Name */}
          <KpiCard
            title="Dataset View Name"
            value={tricyclicDataset?.sql_table_name || ''}
            description="View schema name"
            accentColorClass="border-l-purple-500"
            className="uppercase tracking-wide"
          />
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-white px-6 rounded-lg border shadow-2xs">
          <button
            onClick={() => setActiveTab('scientific')}
            className={`py-4 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 -mb-px transition-colors ${
              activeTab === 'scientific'
                ? 'border-ongc-blue text-ongc-blue'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-350'
            }`}
          >
            <Activity className="w-4 h-4" />
            Scientific Plots
          </button>
          <button
            onClick={() => setActiveTab('builder')}
            className={`py-4 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 -mb-px transition-colors ${
              activeTab === 'builder'
                ? 'border-ongc-blue text-ongc-blue'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-350'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            Interactive Chart Builder
          </button>
        </div>

        {/* Tab Contents */}
        {/* Dataset Records Table (Default Collapsed at Top) */}
        <DashboardDatasetTable
          title="Tricyclic Terpane Biomarker Dataset Records"
          data={tricyclicData}
          variables={tricyclicDataset?.variables}
          isLoading={tricyclicDataLoading}
        />

        {activeTab === 'scientific' && (
          <div className="space-y-6">
            {tricyclicDataLoading ? (
              <div className="flex justify-center items-center h-64">
                <Spinner size="lg" />
              </div>
            ) : !tricyclicData || tricyclicData.length === 0 ? (
              <Card className="p-8 text-center bg-white border border-slate-200">
                <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                <h3 className="text-slate-800 font-bold">No Data Available</h3>
                <p className="text-slate-500 text-sm mt-1">
                  Please upload some data for the Tricyclic Terpane dataset or adjust your filter selections.
                </p>
              </Card>
            ) : (
              <div className="space-y-6">

                {/* Graph 7: TT / TeT Ratio Plot */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3 flex justify-center text-center">
                    <div className="inline-block border border-slate-200/80 px-4 py-1.5 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-base font-bold text-slate-800 tracking-tight text-center">TT / TeT RATIO PLOT</h4>
                    </div>
                  </div>
                  <div className="p-0 w-full h-[760px]">
                    <Plot
                      title="TT / TeT RATIO PLOT"
                      data={renderTTRatioTraces(tricyclicData)}
                      layout={getCommonLayout(
                        '',
                        'Well Name',
                        'Percentage (%)',
                        true
                      )}
                      config={{ responsive: true, displayModeBar: true }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                </Card>
              </div>

            )}
          </div>
        )}

        {activeTab === 'builder' && (
          <Card className="p-6 bg-white border border-slate-200 shadow-2xs">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Interactive Custom Chart Builder</h2>
                <p className="text-xs text-slate-500">Cross-plot any measured biomarker variables dynamically using Plotly.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-600 uppercase">X-Axis:</span>
                  <select
                    value={xVar}
                    onChange={(e) => setXVar(e.target.value)}
                    className="p-1.5 text-xs border rounded bg-white font-medium focus:outline-none text-slate-800"
                  >
                    {numericVars.map((v) => (
                      <option key={v.sql_column_name} value={v.sql_column_name}>
                        {v.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-600 uppercase">Y-Axis:</span>
                  <select
                    value={yVar}
                    onChange={(e) => setYVar(e.target.value)}
                    className="p-1.5 text-xs border rounded bg-white font-medium focus:outline-none text-slate-800"
                  >
                    {numericVars.map((v) => (
                      <option key={v.sql_column_name} value={v.sql_column_name}>
                        {v.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-600 uppercase">Color By:</span>
                  <select
                    value={colorBy}
                    onChange={(e) => setColorBy(e.target.value)}
                    className="p-1.5 text-xs border rounded bg-white font-medium focus:outline-none text-slate-800"
                  >
                    <option value="">-- None --</option>
                    {categoricalVars.map((v) => (
                      <option key={v.sql_column_name} value={v.sql_column_name}>
                        {v.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-600 uppercase">Type:</span>
                  <select
                    value={chartType}
                    onChange={(e) => setChartType(e.target.value)}
                    className="p-1.5 text-xs border rounded bg-white font-medium focus:outline-none text-slate-800"
                  >
                    <option value="scatter">Scatter Plot</option>
                    <option value="bar">Bar Chart</option>
                    <option value="histogram">Histogram</option>
                    <option value="line">Line Plot</option>
                  </select>
                </div>
              </div>
            </div>

            {chartLoading ? (
              <div className="h-[450px] flex items-center justify-center">
                <Spinner size="md" />
              </div>
            ) : (
              <div className="h-[500px]">
                <DynamicPlotlyChart
                  data={chartData || []}
                  xLabel={xVar}
                  yLabel={yVar}
                  chartType={chartType}
                  colorByLabel={colorBy || undefined}
                  title={`${formatParamLabel(xVar)} vs ${formatParamLabel(yVar)}`}
                />
              </div>
            )}
          </Card>
        )}


        </div>
      </div>
    );
  };
