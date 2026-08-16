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

export const SteraneDashboard: React.FC = () => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  
  // Custom builder states
  const [xVar, setXVar] = useState<string>('depth_top');
  const [yVar, setYVar] = useState<string>('total_sterane');
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

  const steraneDataset = datasets?.find((d) => d.name === 'sterane');

  useEffect(() => {
    if (steraneDataset) {
      setSelectedDatasetId(steraneDataset.id);
    }
  }, [steraneDataset]);

  // Set default axes when variables load
  useEffect(() => {
    if (steraneDataset?.variables) {
      const numericVars = steraneDataset.variables.filter((v) => v.is_numeric);
      if (numericVars.length >= 2) {
        setXVar(numericVars[0].sql_column_name);
        setYVar(numericVars[1].sql_column_name);
      }
    }
  }, [steraneDataset]);

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

  // 5. Fetch All Filtered Sterane Records for Scientific Dashboard
  const { data: steraneData, isLoading: steraneDataLoading, refetch: refetchSterane } = useQuery<any[]>({
    queryKey: ['scientific-plots-data-sterane', selectedDatasetId, serializedFilters],
    queryFn: () =>
      api.get<any[]>('/dashboard/scientific-plots', {
        params: {
          dataset_id: selectedDatasetId,
          ...serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  const prPhDataset = datasets?.find((d) => d.name === 'pr_ph');

  // Fetch Pr/Ph data for combined plots
  const { data: prPhData, refetch: refetchPrPh } = useQuery<any[]>({
    queryKey: ['scientific-plots-data-pr-ph', prPhDataset?.id, serializedFilters],
    queryFn: () =>
      api.get<any[]>('/dashboard/scientific-plots', {
        params: {
          dataset_id: prPhDataset?.id,
          ...serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!prPhDataset?.id,
  });

  const handleRefreshAll = () => {
    refetchStats();
    refetchChart();
    refetchSterane();
    refetchPrPh();
  };

  // Client-side join of Sterane and Pr/Ph data by well name and depth
  const combinedSteranePrPhData = React.useMemo(() => {
    if (!steraneData || !prPhData) return [];
    return steraneData.map(stRow => {
      const prPhRow = prPhData.find(prRow => 
        String(prRow.name).trim().toLowerCase() === String(stRow.name).trim().toLowerCase() &&
        Math.abs(parseFloat(prRow.depth) - parseFloat(stRow.depth_top)) < 1.5
      );
      if (prPhRow) {
        return {
          ...stRow,
          pr_by_ph: prPhRow.pr_by_ph
        };
      }
      return null;
    }).filter(Boolean);
  }, [steraneData, prPhData]);

  // Group by Well function for plots
  const getWellGroups = (validData: any[], xField: string, yField: string) => {
    const groups: Record<string, any[]> = {};
    validData.forEach(row => {
      const xVal = xField === 'name' ? row[xField] : parseFloat(row[xField]);
      const yVal = parseFloat(row[yField]);
      if (xField === 'name' ? !!xVal : !isNaN(xVal as number) && !isNaN(yVal)) {
        const well = row.name || 'Unknown Well';
        if (!groups[well]) groups[well] = [];
        groups[well].push({
          x: xVal,
          y: yVal,
          well_name: well,
          depth: row.depth_top || 'N/A',
          formation: row.formation || 'N/A',
          object: row.object_no || 'N/A'
        });
      }
    });
    return groups;
  };




  // Generate Plotly traces for C27-C29 Sterane Ternary Plot
  const renderTernaryTraces = (validData: any[]) => {
    const getCartesianCoords = (c27: number, c28: number, c29: number) => {
      const sum = c27 + c28 + c29;
      if (sum === 0) return { x: 0, y: 0 };
      const a = (c28 / sum) * 100;
      const b = (c27 / sum) * 100;
      const c = (c29 / sum) * 100;
      const x = c + 0.5 * a;
      const y = a * 0.8660254; // Correct height ratio for equilateral triangle: sin(60 deg) = 0.8660254
      return { x, y };
    };

    const zones = [
      {
        name: 'Marine Plankton',
        a: [0, 15, 7, 0, 0],
        b: [100, 85, 79, 80, 100],
        c: [0, 0, 14, 20, 0],
        color: 'rgba(56, 189, 248, 0.12)',
        lineColor: 'rgba(56, 189, 248, 0.4)'
      },
      {
        name: 'Open',
        a: [0, 7, 15, 25, 10, 0, 0],
        b: [80, 79, 85, 75, 68, 65, 80],
        c: [20, 14, 0, 0, 22, 35, 20],
        color: 'rgba(148, 163, 184, 0.12)',
        lineColor: 'rgba(148, 163, 184, 0.4)'
      },
      {
        name: 'Bay/ Estuary',
        a: [0, 10, 25, 100, 45, 30, 15, 0, 0],
        b: [65, 68, 75, 0, 0, 25, 40, 50, 65],
        c: [35, 22, 0, 0, 55, 45, 45, 50, 35],
        color: 'rgba(251, 191, 36, 0.12)',
        lineColor: 'rgba(251, 191, 36, 0.4)'
      },
      {
        name: 'Terrestrial',
        a: [0, 15, 30, 45, 20, 10, 0, 0],
        b: [50, 40, 25, 0, 0, 15, 25, 50],
        c: [50, 45, 45, 55, 80, 75, 75, 50],
        color: 'rgba(74, 222, 128, 0.12)',
        lineColor: 'rgba(74, 222, 128, 0.4)'
      },
      {
        name: 'Higher Plants',
        a: [0, 20, 10, 0, 0],
        b: [0, 0, 15, 25, 0],
        c: [100, 80, 75, 75, 100],
        color: 'rgba(52, 211, 153, 0.12)',
        lineColor: 'rgba(52, 211, 153, 0.4)'
      }
    ];

    const traces: any[] = zones.map(z => {
      const xVals: number[] = [];
      const yVals: number[] = [];
      for (let i = 0; i < z.a.length; i++) {
        const pt = getCartesianCoords(z.b[i], z.a[i], z.c[i]);
        xVals.push(pt.x);
        yVals.push(pt.y);
      }
      return {
        type: 'scatter' as any,
        mode: 'lines',
        name: z.name,
        x: xVals,
        y: yVals,
        fill: 'toself',
        fillcolor: z.color,
        line: { color: z.lineColor, width: 1.5, dash: 'dash' },
        hoverinfo: 'name',
        showlegend: true
      };
    });

    // Add black triangle outline
    traces.push({
      type: 'scatter' as any,
      mode: 'lines',
      x: [0, 50, 100, 0],
      y: [0, 86.60254, 0, 0],
      line: { color: '#0F172A', width: 1.5 },
      showlegend: false,
      hoverinfo: 'none'
    });

    const groups: Record<string, any[]> = {};
    validData.forEach(row => {
      const c27r = parseFloat(row.c27_sterane_r);
      const c28r = parseFloat(row.c28_sterane_r);
      const c29r = parseFloat(row.c29_sterane_r);
      
      if (!isNaN(c27r) && !isNaN(c28r) && !isNaN(c29r)) {
        const sum_r = c27r + c28r + c29r;
        if (sum_r > 0) {
          const aVal = (c28r / sum_r) * 100; // % C28 St (R)
          const bVal = (c27r / sum_r) * 100; // % C27 St (R)
          const cVal = (c29r / sum_r) * 100; // % C29 St (R)
          
          const well = row.name || 'Unknown Well';
          if (!groups[well]) groups[well] = [];
          const pt = getCartesianCoords(bVal, aVal, cVal);
          groups[well].push({
            x: pt.x,
            y: pt.y,
            a: aVal,
            b: bVal,
            c: cVal,
            depth: row.depth_top || 'N/A',
            formation: row.formation || 'N/A',
            object: row.object_no || 'N/A'
          });
        }
      }
    });

    const wellStyles: Record<string, { color: string, symbol: string }> = {
      'A': { color: '#0099ff', symbol: 'circle' },
      'B': { color: '#8b4513', symbol: 'circle' },
      'C': { color: '#22c55e', symbol: 'triangle-up' },
      'D': { color: '#ef4444', symbol: 'circle' }
    };

    Object.entries(groups).forEach(([well, pts]) => {
      const style = wellStyles[well] || { color: undefined, symbol: 'circle' };
      traces.push({
        type: 'scatter' as any,
        mode: 'markers',
        name: well,
        x: pts.map(p => p.x),
        y: pts.map(p => p.y),
        marker: { 
          size: 9, 
          color: style.color,
          symbol: style.symbol,
          line: { width: 0.5, color: 'white' } 
        },
        text: pts.map(p => `<b>Well Name:</b> ${well}<br><b>Depth:</b> ${p.depth} m<br><b>Formation:</b> ${p.formation}<br><b>Object:</b> ${p.object}<br><b>C27 St (R):</b> ${p.b.toFixed(2)}%<br><b>C28 St (R):</b> ${p.a.toFixed(2)}%<br><b>C29 St (R):</b> ${p.c.toFixed(2)}%`),
        hovertemplate: '%{text}<extra></extra>'
      });
    });

    return traces;
  };

  // Generate Plotly traces for Sterane Maturity Plot
  const renderMaturityTraces = (validData: any[]) => {
    const traces: any[] = [];
    const groups = getWellGroups(validData, 'c29_bb_by_aa_plus_bb', 'c29_s_by_s_plus_r');
    const wellStyles: Record<string, { color: string, symbol: string }> = {
      'A': { color: '#0099ff', symbol: 'circle' },
      'B': { color: '#8b4513', symbol: 'circle' },
      'C': { color: '#22c55e', symbol: 'triangle-up' },
      'D': { color: '#ef4444', symbol: 'circle' }
    };
    Object.entries(groups).forEach(([well, pts]) => {
      const style = wellStyles[well] || { color: undefined, symbol: 'circle' };
      traces.push({
        x: pts.map(p => p.x),
        y: pts.map(p => p.y),
        mode: 'markers',
        name: well,
        marker: { 
          size: 9, 
          color: style.color,
          symbol: style.symbol,
          line: { width: 0.5, color: 'white' } 
        },
        text: pts.map(p => `<b>Well Name:</b> ${well}<br><b>Depth:</b> ${p.depth} m<br><b>Formation:</b> ${p.formation}<br><b>Object:</b> ${p.object}<br><b>C29 ββ/(αα+ββ):</b> ${p.x.toFixed(3)}<br><b>C29 S/(S+R):</b> ${p.y.toFixed(3)}`),
        hovertemplate: '%{text}<extra></extra>'
      });
    });

    // Add open circles for the maturity arrow endpoints matching the reference
    traces.push({
      x: [0.12, 0.62],
      y: [0.18, 0.56],
      mode: 'markers',
      marker: {
        symbol: 'circle',
        color: '#ffffff',
        size: 7,
        line: { color: '#475569', width: 1.5 }
      },
      showlegend: false,
      hoverinfo: 'skip'
    });

    return traces;
  };

  // Generate Plotly traces for Sterane vs Pr/Ph Plot
  const renderSteranePrPhTraces = (combinedData: any[]) => {
    const wellStyles: Record<string, { color: string, symbol: string }> = {
      'A': { color: '#0099ff', symbol: 'circle' },
      'B': { color: '#8b4513', symbol: 'circle' },
      'C': { color: '#22c55e', symbol: 'triangle-up' },
      'D': { color: '#ef4444', symbol: 'circle' }
    };
    const groups: Record<string, any[]> = {};
    combinedData.forEach(row => {
      const xVal = parseFloat(row.pr_by_ph);
      const yVal = parseFloat(row.c27r_by_c27r_plus_c29r);
      if (!isNaN(xVal) && !isNaN(yVal)) {
        const well = row.name || 'Unknown Well';
        if (!groups[well]) groups[well] = [];
        groups[well].push({
          x: xVal,
          y: yVal,
          depth: row.depth_top || 'N/A',
          formation: row.formation || 'N/A',
          object: row.object_no || 'N/A'
        });
      }
    });

    return Object.entries(groups).map(([well, pts]) => {
      const style = wellStyles[well] || { color: undefined, symbol: 'circle' };
      return {
        x: pts.map(p => p.x),
        y: pts.map(p => p.y),
        mode: 'markers',
        name: well,
        marker: { 
          size: 9, 
          color: style.color,
          symbol: style.symbol,
          line: { width: 0.5, color: 'white' } 
        },
        text: pts.map(p => `<b>Well Name:</b> ${well}<br><b>Depth:</b> ${p.depth} m<br><b>Formation:</b> ${p.formation}<br><b>Object:</b> ${p.object}<br><b>Pr/Ph:</b> ${p.x.toFixed(2)}<br><b>Sterane C27R/(C27R+C29R):</b> ${p.y.toFixed(3)}`),
        hovertemplate: '%{text}<extra></extra>'
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

  // Export report
  const handleExportPDF = async () => {
    if (!selectedDatasetId) return;
    try {
      await reportsService.downloadReport('pdf', selectedDatasetId, serializedFilters);
    } catch (err) {
      console.error('Failed to export PDF:', err);
    }
  };

  if (datasetsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!steraneDataset) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
            <h3 className="text-red-800 font-bold">Sterane Dataset Not Registered</h3>
          </div>
          <p className="text-red-700 text-sm mt-2">
            Please run the database migrations and check the backend container startup seeding logs to register the dataset.
          </p>
        </div>
      </div>
    );
  }

  // Extracted lists for filter display
  const numericVars = steraneDataset.variables.filter((v) => v.is_numeric);
  const categoricalVars = steraneDataset.variables.filter((v) => !v.is_numeric && !['id', 'remarks', 'analysed_at', 'insert_user', 'insert_date', 'update_user', 'update_date', 'uploaded_by'].includes(v.sql_column_name));

  return (
    <div className="flex animate-fade-in gap-6">
      {/* Dynamic Filter Sidebar - Consistent with Source Rock Lab */}
      {showFilters && (
        <aside className="w-80 bg-white border border-slate-200/80 p-5 flex flex-col shrink-0 rounded-2xl h-fit shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-ongc-blue" />
              <h2 className="font-bold text-slate-800">REGISTRY FILTERS</h2>
              {activeFiltersCount > 0 && (
                <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[9px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                  {activeFiltersCount} active
                </span>
              )}
            </div>
            <span 
              className="text-xs font-bold text-slate-500 hover:text-slate-800 select-none cursor-pointer"
              onClick={() => setShowFilters(false)}
            >
              Hide Filters ˄
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            {/* Generate dynamic categorical filters */}
            {categoricalVars.map((v) => {
              const col = v.sql_column_name;
              const options = metadata?.filter_options?.[col] || [];
              const searchVal = filterSearches[col] || '';
              const filteredOptions = options.filter(opt => opt.toLowerCase().includes(searchVal.toLowerCase()));

              return (
                <div key={col} className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    {v.display_name}
                  </label>
                  
                  {options.length > 5 && (
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder={`Search ${v.display_name.toLowerCase()}...`}
                        value={searchVal}
                        onChange={(e) => setFilterSearches(prev => ({ ...prev, [col]: e.target.value }))}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-ongc-blue text-slate-800"
                      />
                    </div>
                  )}

                  <div className="max-h-32 overflow-y-auto border border-slate-100 rounded-md p-2 space-y-1.5 bg-slate-50/50">
                    {filteredOptions.length === 0 ? (
                      <span className="text-[10px] text-slate-400 italic p-1 block">No options</span>
                    ) : (
                      filteredOptions.map((opt) => {
                        const isChecked = filters[col]?.includes(opt) || false;
                        return (
                          <button
                            key={opt}
                            onClick={() => toggleMultiSelect(col, opt)}
                            className="flex items-center gap-2 w-full text-left text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors py-0.5"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-3.5 h-3.5 text-ongc-blue fill-ongc-blue/10 shrink-0" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                            )}
                            <span className="truncate">{opt}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}

            {/* Range filters (e.g. depth_top, depth_bottom, total_sterane) */}
            {['depth_top', 'depth_bottom', 'total_sterane'].map((col) => {
              const v = steraneDataset.variables.find((x) => x.sql_column_name === col);
              if (!v) return null;
              const range = metadata?.filter_ranges?.[col];
              const minLimit = range?.min !== undefined ? Math.floor(range.min) : 0;
              const maxLimit = range?.max !== undefined ? Math.ceil(range.max) : 1000;
              
              const currentMin = filters[col]?.min !== undefined ? filters[col].min : '';
              const currentMax = filters[col]?.max !== undefined ? filters[col].max : '';

              return (
                <div key={col} className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    {v.display_name} {v.display_unit ? `(${v.display_unit})` : ''}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder={`Min: ${minLimit}`}
                      value={currentMin}
                      onChange={(e) => handleRangeChange(col, 'min', e.target.value)}
                      className="w-1/2 p-1.5 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-ongc-blue text-center text-slate-800 bg-white"
                    />
                    <span className="text-slate-400 text-xs">to</span>
                    <input
                      type="number"
                      placeholder={`Max: ${maxLimit}`}
                      value={currentMax}
                      onChange={(e) => handleRangeChange(col, 'max', e.target.value)}
                      className="w-1/2 p-1.5 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-ongc-blue text-center text-slate-800 bg-white"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t pt-4 mt-6 flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              disabled={activeFiltersCount === 0}
              className="w-1/2 text-xs"
            >
              Reset Filters
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleRefreshAll()}
              className="w-1/2 text-xs font-bold"
            >
              Apply
            </Button>
          </div>
        </aside>
      )}

      {/* Main Dashboard Space */}
      <div className="flex-1 space-y-6 min-w-0">
        {!showFilters && (
          <Card className="bg-slate-50/50 border-slate-200 shadow-xs cursor-pointer" noPadding>
            <div className="flex items-center justify-between p-6" onClick={() => setShowFilters(true)}>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <Filter className="w-4 h-4 text-ongc-blue" />
                <span>REGISTRY FILTERS</span>
                {activeFiltersCount > 0 && (
                  <Badge label={`${activeFiltersCount} active`} customColor="bg-amber-100 text-amber-800 border-amber-200 font-bold" />
                )}
              </div>
              <div className="flex items-center gap-3">
                {activeFiltersCount > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleResetFilters(); }}
                    className="text-[10px] font-bold text-slate-400 hover:text-ongc-blue transition-colors"
                  >
                    Clear All
                  </button>
                )}
                <span className="text-xs font-bold text-slate-500 hover:text-slate-800 select-none">
                  Show Filters ˅
                </span>
              </div>
            </div>
          </Card>
        )}

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
            value={steraneDataset?.variables.length || 0}
            description="Active variables"
            accentColorClass="border-l-emerald-500"
          />

          {/* KPI 4: Dataset Module */}
          <KpiCard
            title="Dataset Module"
            value={steraneDataset?.module || ''}
            description="Module scope"
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
        {activeTab === 'scientific' && (
          <div className="space-y-6">
            {steraneDataLoading ? (
              <div className="flex justify-center items-center h-64">
                <Spinner size="lg" />
              </div>
            ) : !steraneData || steraneData.length === 0 ? (
              <Card className="p-8 text-center bg-white border border-slate-200">
                <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                <h3 className="text-slate-800 font-bold">No Data Available</h3>
                <p className="text-slate-500 text-sm mt-1">
                  Please upload some data for the Sterane dataset or adjust your filter selections.
                </p>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Graph 11: C27-C29 Sterane Ternary Plot */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">C27-C29 STERANE TERNARY PLOT</h4>
                    </div>
                  </div>
                  <div className="p-0 w-full h-[760px]">
                    <Plot
                      data={renderTernaryTraces(steraneData)}
                      layout={{
                        title: {
                          text: '',
                          font: { size: 14, color: '#1e293b', family: 'Inter, sans-serif', weight: 'bold' as any }
                        },
                        xaxis: {
                          range: [-15, 115],
                          showgrid: false,
                          zeroline: false,
                          tickvals: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
                          ticktext: ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'],
                          tickfont: { size: 11, color: '#475569' },
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2,
                          ticks: 'outside',
                          tickcolor: '#000000',
                          tickwidth: 1.5,
                          ticklen: 6
                        },
                        yaxis: {
                          range: [-5, 95], // Move the X-axis line (bottom of plot area at y=-5) close to the triangle bottom edge (y=0)
                          scaleanchor: 'x',
                          scaleratio: 1,
                          showgrid: false,
                          zeroline: false,
                          showticklabels: false,
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        margin: { l: 40, r: 40, t: 60, b: 100 },
                        hovermode: 'closest' as any,
                        showlegend: true,
                        legend: {
                          orientation: 'h' as any,
                          x: 0.5,
                          y: -0.15,
                          xanchor: 'center',
                          yanchor: 'top',
                          font: { size: 10, color: '#475569', family: 'Inter, sans-serif' },
                          bordercolor: '#cbd5e1',
                          borderwidth: 1
                        },
                        annotations: [
                          {
                            x: 50,
                            y: 86.60254, // Adjusted top vertex Y coordinate
                            xref: 'x',
                            yref: 'y',
                            text: '<b>C<sub>28</sub> (100%)</b>',
                            showarrow: false,
                            font: { size: 11, color: '#1e293b' },
                            yanchor: 'bottom'
                          },
                          {
                            x: 0,
                            y: 0,
                            xref: 'x',
                            yref: 'y',
                            text: '<b>C<sub>27</sub> (100%)</b>',
                            showarrow: false,
                            font: { size: 11, color: '#1e293b' },
                            xanchor: 'right',
                            yanchor: 'top'
                          },
                          {
                            x: 100,
                            y: 0,
                            xref: 'x',
                            yref: 'y',
                            text: '<b>C<sub>29</sub> (100%)</b>',
                            showarrow: false,
                            font: { size: 11, color: '#1e293b' },
                            xanchor: 'left',
                            yanchor: 'top'
                          }
                        ]
                      }}
                      config={{ responsive: true, displayModeBar: true }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                </Card>

                {/* Graph 12: Sterane Maturity Plot */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">C29 STERANE MATURITY PLOT</h4>
                    </div>
                  </div>
                  <div className="p-0 w-full h-[760px]">
                    <Plot
                      data={renderMaturityTraces(steraneData)}
                      layout={{
                        ...getCommonLayout(
                          '',
                          'C29 ββ/(αα+ββ)',
                          'C29 S/(S+R)'
                        ),
                        xaxis: {
                          title: { text: 'C29 ββ/(αα+ββ)' },
                          range: [0, 0.8],
                          gridcolor: '#f1f5f9',
                          zerolinecolor: '#000000',
                          tickfont: { size: 11, color: '#475569' },
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        yaxis: {
                          title: { text: 'C29 S/(S+R)' },
                          range: [0, 0.8],
                          gridcolor: '#f1f5f9',
                          zerolinecolor: '#000000',
                          tickfont: { size: 11, color: '#475569' },
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2,
                          scaleanchor: 'x',
                          scaleratio: 1
                        },
                        shapes: [
                          {
                            type: 'line',
                            x0: 0.26,
                            x1: 0.26,
                            y0: 0,
                            y1: 0.8,
                            line: { color: 'rgba(15, 23, 42, 0.45)', width: 1.5, dash: 'dashdot' }
                          },
                          {
                            type: 'line',
                            x0: 0,
                            x1: 0.8,
                            y0: 0.55,
                            y1: 0.55,
                            line: { color: 'rgba(15, 23, 42, 0.45)', width: 1.5, dash: 'dashdot' }
                          },
                          {
                            type: 'line',
                            x0: 0.70,
                            x1: 0.70,
                            y0: 0,
                            y1: 0.8,
                            line: { color: 'rgba(15, 23, 42, 0.45)', width: 1.5, dash: 'dashdot' }
                          }
                        ],
                        annotations: [
                          {
                            x: 0.26,
                            y: 0.78,
                            xref: 'x',
                            yref: 'y',
                            text: '<b>VRo = 0.6%</b>',
                            showarrow: false,
                            font: { size: 10, color: '#475569' },
                            bgcolor: '#ffffff',
                            bordercolor: '#e2e8f0',
                            borderwidth: 1
                          },
                          {
                            x: 0.05,
                            y: 0.55,
                            xref: 'x',
                            yref: 'y',
                            text: '<b>VRo = 0.8%</b>',
                            showarrow: false,
                            font: { size: 10, color: '#475569' },
                            bgcolor: '#ffffff',
                            bordercolor: '#e2e8f0',
                            borderwidth: 1
                          },
                          {
                            x: 0.70,
                            y: 0.78,
                            xref: 'x',
                            yref: 'y',
                            text: '<b>VRo = 0.9%</b>',
                            showarrow: false,
                            font: { size: 10, color: '#475569' },
                            bgcolor: '#ffffff',
                            bordercolor: '#e2e8f0',
                            borderwidth: 1
                          },
                          {
                            x: 0.62,
                            y: 0.56,
                            ax: 0.12,
                            ay: 0.18,
                            xref: 'x',
                            yref: 'y',
                            axref: 'x',
                            ayref: 'y',
                            text: '',
                            showarrow: true,
                            arrowhead: 2,
                            arrowsize: 1.2,
                            arrowwidth: 1.5,
                            arrowcolor: '#4a0404'
                          },
                          {
                            x: 0.37,
                            y: 0.37,
                            xref: 'x',
                            yref: 'y',
                            text: '<b>Increasing Maturity</b>',
                            showarrow: false,
                            textangle: -37,
                            font: { size: 11, color: '#4a0404', family: 'Inter, sans-serif' },
                            yshift: 10
                          }
                        ]
                      }}
                      config={{ responsive: true, displayModeBar: true }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                </Card>

                {/* Graph 13: Sterane vs Pr/Ph */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">STERANE C27R/(C27R+C29R) vs PR/PH</h4>
                    </div>
                  </div>
                  <div className="p-0 w-full h-[760px]">
                    <Plot
                      data={renderSteranePrPhTraces(combinedSteranePrPhData)}
                      layout={{
                        ...getCommonLayout(
                          '',
                          'Pr/Ph',
                          'C27R/(C27R+C29R)'
                        ),
                        xaxis: {
                          title: { text: 'Pr/Ph' },
                          range: [0, 7],
                          gridcolor: '#f1f5f9',
                          zerolinecolor: '#000000',
                          tickfont: { size: 11, color: '#475569' },
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        yaxis: {
                          title: { text: 'C27R/(C27R+C29R)' },
                          range: [0, 1],
                          gridcolor: '#f1f5f9',
                          zerolinecolor: '#000000',
                          tickfont: { size: 11, color: '#475569' },
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2,
                          scaleanchor: 'x',
                          scaleratio: 5.0
                        },
                        shapes: [
                          {
                            type: 'line',
                            x0: 2.0,
                            x1: 2.0,
                            y0: 0,
                            y1: 1.0,
                            line: { color: 'rgba(15, 23, 42, 0.45)', width: 1.5, dash: 'dash' }
                          },
                          {
                            type: 'line',
                            x0: 0,
                            x1: 7,
                            y0: 0.5,
                            y1: 0.5,
                            line: { color: 'rgba(15, 23, 42, 0.45)', width: 1.5, dash: 'dash' }
                          }
                        ],
                        annotations: [
                          {
                            x: 1.0, y: 0.75, xref: 'x', yref: 'y', text: '<b>Pelagic Anoxic</b>',
                            showarrow: false, font: { size: 11, color: '#64748b' }
                          },
                          {
                            x: 1.0, y: 0.25, xref: 'x', yref: 'y', text: '<b>Terrestrial/Coastal Anoxic</b>',
                            showarrow: false, font: { size: 11, color: '#64748b' }
                          },
                          {
                            x: 4.5, y: 0.75, xref: 'x', yref: 'y', text: '<b>Pelagic Oxic</b>',
                            showarrow: false, font: { size: 11, color: '#64748b' }
                          },
                          {
                            x: 4.5, y: 0.25, xref: 'x', yref: 'y', text: '<b>Terrestrial/Coastal Oxic</b>',
                            showarrow: false, font: { size: 11, color: '#64748b' }
                          }
                        ]
                      }}
                      config={{ responsive: true, displayModeBar: true }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                </Card>

                <DashboardDatasetTable
                  title="Sterane Biomarker Dataset Records"
                  data={steraneData}
                  variables={steraneDataset?.variables}
                  isLoading={steraneDataLoading}
                />
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
