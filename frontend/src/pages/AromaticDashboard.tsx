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

export const AromaticDashboard: React.FC = () => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  
  // Custom builder states
  const [xVar, setXVar] = useState<string>('depth');
  const [yVar, setYVar] = useState<string>('vrc');
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

  const aromaticDataset = datasets?.find((d) => d.name === 'aromatic_biomarkers');

  useEffect(() => {
    if (aromaticDataset) {
      setSelectedDatasetId(aromaticDataset.id);
    }
  }, [aromaticDataset]);

  // Set default axes when variables load
  useEffect(() => {
    if (aromaticDataset?.variables) {
      const numericVars = aromaticDataset.variables.filter((v) => v.is_numeric);
      if (numericVars.length >= 2) {
        setXVar(numericVars[0].sql_column_name);
        setYVar(numericVars[1].sql_column_name);
      }
    }
  }, [aromaticDataset]);

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

  // 5. Fetch All Filtered Aromatic Records for Scientific Dashboard
  const { data: aromaticData, isLoading: aromaticDataLoading, refetch: refetchAromatic } = useQuery<any[]>({
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

  const prPhDataset = datasets?.find((d) => d.name === 'pr_ph');

  // Fetch Pr/Ph data for combined plots
  const { data: prPhData, refetch: refetchPrPh } = useQuery<any[]>({
    queryKey: ['scientific-plots-data-pr-ph-combined', prPhDataset?.id, serializedFilters],
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
    refetchAromatic();
    refetchPrPh();
  };

  // Client-side join of Aromatic and Pr/Ph data by well name and depth
  const combinedAromaticPrPhData = React.useMemo(() => {
    if (!aromaticData || !prPhData) return [];
    return aromaticData.map(arRow => {
      const prRow = prPhData.find(pr => 
        String(pr.name).trim().toLowerCase() === String(arRow.name).trim().toLowerCase() &&
        Math.abs(parseFloat(pr.depth) - parseFloat(arRow.depth)) < 1.5
      );
      if (prRow) {
        return {
          ...arRow,
          pr_by_ph: prRow.pr_by_ph
        };
      }
      return null;
    }).filter(Boolean);
  }, [aromaticData, prPhData]);

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

  if (!aromaticDataset) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
            <h3 className="text-red-800 font-bold">Aromatic Biomarkers Dataset Not Registered</h3>
          </div>
          <p className="text-red-700 text-sm mt-2">
            Please run the database migrations and check the backend container startup seeding logs to register the dataset.
          </p>
        </div>
      </div>
    );
  }



  // Style registry matching scientific standards for Wells A to R
  const getWellStyle = (well: string) => {
    const name = String(well).trim().toUpperCase();
    const styles: Record<string, { color: string, symbol: string }> = {
      'A': { color: '#3b82f6', symbol: 'diamond' },
      'B': { color: '#ef4444', symbol: 'square' },
      'C': { color: '#10b981', symbol: 'triangle-up' },
      'D': { color: '#8b5cf6', symbol: 'x' },
      'E': { color: '#f59e0b', symbol: 'circle' },
      'F': { color: '#ec4899', symbol: 'diamond' },
      'G': { color: '#22c55e', symbol: 'triangle-down' },
      'H': { color: '#6366f1', symbol: 'cross' },
      'I': { color: '#84cc16', symbol: 'pentagon' },
      'J': { color: '#14b8a6', symbol: 'hexagram' },
      'K': { color: '#d97706', symbol: 'star' },
      'L': { color: '#4f46e5', symbol: 'triangle-left' },
      'M': { color: '#db2777', symbol: 'triangle-right' },
      'N': { color: '#059669', symbol: 'hourglass' },
      'O': { color: '#7c3aed', symbol: 'bowtie' },
      'P': { color: '#9333ea', symbol: 'diamond-cross' },
      'Q': { color: '#ea580c', symbol: 'circle-cross' },
      'R': { color: '#be123c', symbol: 'square-cross' }
    };
    return styles[name] || { color: '#64748b', symbol: 'circle' };
  };

  // Helper to generate coordinates for group boundary ellipses
  const getEllipseCoords = (xc: number, yc: number, a: number, b: number, thetaDeg: number) => {
    const theta = (thetaDeg * Math.PI) / 180;
    const xVals: number[] = [];
    const yVals: number[] = [];
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const t = (i * 2 * Math.PI) / steps;
      const x = xc + a * Math.cos(t) * Math.cos(theta) - b * Math.sin(t) * Math.sin(theta);
      const y = yc + a * Math.cos(t) * Math.sin(theta) + b * Math.sin(t) * Math.cos(theta);
      xVals.push(x);
      yVals.push(y);
    }
    return { x: xVals, y: yVals };
  };

  // Generate Plotly traces for NDR vs TMN Plot
  const renderNDRTMNTraces = (validData: any[]) => {
    const groups: Record<string, any[]> = {};
    validData.forEach(row => {
      const xVal = parseFloat(row.tmn_ratio);
      const yVal = parseFloat(row.ndr);
      if (!isNaN(xVal) && !isNaN(yVal)) {
        const well = row.name || 'Unknown Well';
        if (!groups[well]) groups[well] = [];
        groups[well].push({
          x: xVal,
          y: yVal,
          depth: row.depth || 'N/A',
          formation: row.formation || 'N/A',
          object: row.object || 'N/A'
        });
      }
    });

    return Object.entries(groups).map(([well, pts]) => {
      const style = getWellStyle(well);
      return {
        x: pts.map(p => p.x),
        y: pts.map(p => p.y),
        mode: 'markers' as any,
        name: well,
        marker: { 
          size: 10, 
          color: style.color, 
          symbol: style.symbol,
          line: { width: 0.5, color: 'white' } 
        },
        text: pts.map(p => `<b>Well Name:</b> ${well}<br><b>Depth:</b> ${p.depth} m<br><b>Formation:</b> ${p.formation}<br><b>1,2,7-TMN/1,3,7-TMN:</b> ${p.x.toFixed(3)}<br><b>NDR %:</b> ${p.y.toFixed(3)}`),
        hovertemplate: '%{text}<extra></extra>'
      };
    });
  };

  // Generate Plotly traces for ETR vs TMN Plot (with background ellipses)
  const renderETRTMNTraces = (validData: any[]) => {
    const groups: Record<string, any[]> = {};
    validData.forEach(row => {
      const xVal = parseFloat(row.tmn_ratio);
      const yVal = parseFloat(row.etr);
      if (!isNaN(xVal) && !isNaN(yVal)) {
        const well = row.name || 'Unknown Well';
        if (!groups[well]) groups[well] = [];
        groups[well].push({
          x: xVal,
          y: yVal,
          depth: row.depth || 'N/A',
          formation: row.formation || 'N/A',
          object: row.object || 'N/A'
        });
      }
    });

    const dataTraces = Object.entries(groups).map(([well, pts]) => {
      const style = getWellStyle(well);
      return {
        x: pts.map(p => p.x),
        y: pts.map(p => p.y),
        mode: 'markers' as any,
        name: well,
        marker: { 
          size: 10, 
          color: style.color, 
          symbol: style.symbol,
          line: { width: 0.5, color: 'white' } 
        },
        text: pts.map(p => `<b>Well Name:</b> ${well}<br><b>Depth:</b> ${p.depth} m<br><b>Formation:</b> ${p.formation}<br><b>1,2,7-TMN/1,3,7-TMN:</b> ${p.x.toFixed(3)}<br><b>ETR %:</b> ${p.y.toFixed(3)}`),
        hovertemplate: '%{text}<extra></extra>'
      };
    });

    // Draw the 4 groups boundary ellipses
    const e1 = getEllipseCoords(0.45, 1.85, 0.35, 0.45, 0);
    const e2 = getEllipseCoords(0.35, 0.62, 0.16, 0.33, 0);
    const e3 = getEllipseCoords(0.92, 0.24, 0.28, 0.10, -30);
    const e4 = getEllipseCoords(1.68, 0.05, 0.92, 0.22, -5);

    const ellipsesTraces = [
      {
        x: e1.x,
        y: e1.y,
        mode: 'lines' as any,
        line: { color: 'rgba(71, 85, 105, 0.6)', width: 1.5 },
        hoverinfo: 'none' as any,
        showlegend: false
      },
      {
        x: e2.x,
        y: e2.y,
        mode: 'lines' as any,
        line: { color: 'rgba(71, 85, 105, 0.6)', width: 1.5 },
        hoverinfo: 'none' as any,
        showlegend: false
      },
      {
        x: e3.x,
        y: e3.y,
        mode: 'lines' as any,
        line: { color: 'rgba(71, 85, 105, 0.6)', width: 1.5 },
        hoverinfo: 'none' as any,
        showlegend: false
      },
      {
        x: e4.x,
        y: e4.y,
        mode: 'lines' as any,
        line: { color: 'rgba(71, 85, 105, 0.6)', width: 1.5 },
        hoverinfo: 'none' as any,
        showlegend: false
      }
    ];

    return [...ellipsesTraces, ...dataTraces];
  };

  // Generate Plotly traces for DBT/Phe vs Pr/Ph Plot with background zones & explanations as legend
  const renderAromaticPrPhTraces = (combinedData: any[]) => {
    const groups: Record<string, any[]> = {};
    combinedData.forEach(row => {
      const xVal = parseFloat(row.pr_by_ph);
      const yVal = parseFloat(row.dbt_by_phe);
      if (!isNaN(xVal) && !isNaN(yVal)) {
        const well = row.name || 'Unknown Well';
        if (!groups[well]) groups[well] = [];
        groups[well].push({
          x: xVal,
          y: yVal,
          depth: row.depth || 'N/A',
          formation: row.formation || 'N/A',
          object: row.object || 'N/A'
        });
      }
    });

    const dataTraces = Object.entries(groups).map(([well, pts]) => {
      const style = getWellStyle(well);
      return {
        x: pts.map(p => p.x),
        y: pts.map(p => p.y),
        mode: 'markers' as any,
        name: well,
        marker: { 
          size: 10, 
          color: style.color, 
          symbol: style.symbol,
          line: { width: 0.5, color: 'white' } 
        },
        text: pts.map(p => `<b>Well Name:</b> ${well}<br><b>Depth:</b> ${p.depth} m<br><b>Formation:</b> ${p.formation}<br><b>Object:</b> ${p.object}<br><b>Pr/Ph:</b> ${p.x.toFixed(3)}<br><b>DBT/Phe:</b> ${p.y.toFixed(3)}`),
        hovertemplate: '%{text}<extra></extra>',
        legendgroup: 'wells',
        showlegend: true
      };
    });

    // Custom legend traces for Zones
    const zoneTraces = [
      {
        x: [null],
        y: [null],
        mode: 'markers' as any,
        name: 'Zone-1 Marine Carbonate & Marine Marl',
        marker: { symbol: 'square', color: 'rgba(59, 130, 246, 0.25)', size: 12 },
        legendgroup: 'zones',
        showlegend: true
      },
      {
        x: [null],
        y: [null],
        mode: 'markers' as any,
        name: 'Zone-2 Lacustrine Hypersaline',
        marker: { symbol: 'square', color: 'rgba(245, 158, 11, 0.25)', size: 12 },
        legendgroup: 'zones',
        showlegend: true
      },
      {
        x: [null],
        y: [null],
        mode: 'markers' as any,
        name: 'Zone-3 Marine Shale & Other Lacustrine',
        marker: { symbol: 'square', color: 'rgba(16, 185, 129, 0.25)', size: 12 },
        legendgroup: 'zones',
        showlegend: true
      },
      {
        x: [null],
        y: [null],
        mode: 'markers' as any,
        name: 'Zone-4 Fluvial-Deltaic Shale & Coal',
        marker: { symbol: 'square', color: 'rgba(239, 68, 68, 0.25)', size: 12 },
        legendgroup: 'zones',
        showlegend: true
      }
    ];

    // Background filled polygons for visual zones
    const backgroundTraces = [
      {
        x: [0, 1.0, 1.0, 0, 0],
        y: [1.0, 1.0, 2.0, 2.0, 1.0],
        fill: 'toself' as any,
        fillcolor: 'rgba(59, 130, 246, 0.05)',
        line: { color: 'transparent' },
        hoverinfo: 'none' as any,
        showlegend: false
      },
      {
        x: [0, 1.0, 1.0, 0, 0],
        y: [0, 0, 1.0, 1.0, 0],
        fill: 'toself' as any,
        fillcolor: 'rgba(245, 158, 11, 0.05)',
        line: { color: 'transparent' },
        hoverinfo: 'none' as any,
        showlegend: false
      },
      {
        x: [1.0, 3.0, 3.0, 1.0, 1.0],
        y: [0, 0, 1.0, 1.0, 0],
        fill: 'toself' as any,
        fillcolor: 'rgba(16, 185, 129, 0.05)',
        line: { color: 'transparent' },
        hoverinfo: 'none' as any,
        showlegend: false
      },
      {
        x: [3.0, 8.0, 8.0, 3.0, 3.0],
        y: [0, 0, 1.0, 1.0, 0],
        fill: 'toself' as any,
        fillcolor: 'rgba(239, 68, 68, 0.05)',
        line: { color: 'transparent' },
        hoverinfo: 'none' as any,
        showlegend: false
      }
    ];

    return [...backgroundTraces, ...dataTraces, ...zoneTraces];
  };

  // Common Layout Generator matching LIMS dashboard visual guidelines
  const getCommonLayout = (titleText: string, xAxisTitle: string, yAxisTitle: string, isCategoricalX = false) => applyGlobalLayoutDefaults({
    title: {
      text: titleText,
      font: { family: 'Inter, sans-serif', size: 15, color: '#0F172A', bold: true }
    },
    xaxis: {
      title: { text: `<b>${xAxisTitle}</b>`, font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
      type: isCategoricalX ? 'category' as any : undefined,
      gridcolor: '#F1F5F9',
      zeroline: false,
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2
    },
    yaxis: {
      title: { text: `<b>${yAxisTitle}</b>`, font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
      gridcolor: '#F1F5F9',
      zeroline: false,
      showline: true,
      mirror: true,
      linecolor: '#000000',
      linewidth: 2
    },
    margin: { l: 85, r: 35, t: 80, b: 100 },
    autosize: true,
    hovermode: 'closest' as any,
    legend: {
      orientation: 'h' as any,
      y: -0.22,
      xanchor: 'center' as any,
      x: 0.5,
      font: { family: 'Inter, sans-serif', size: 10, color: '#475569' },
      bordercolor: '#cbd5e1',
      borderwidth: 1
    },
    paper_bgcolor: '#FFFFFF',
    plot_bgcolor: '#FFFFFF'
  });

  // Extracted lists for filter display
  const numericVars = aromaticDataset.variables.filter((v) => v.is_numeric);
  const categoricalVars = aromaticDataset.variables.filter((v) => !v.is_numeric && !['id', 'remarks', 'analysed_at', 'insert_user', 'insert_date', 'update_user', 'update_date', 'uploaded_by'].includes(v.sql_column_name));

  // Filters required: UBHI, NAME, FORMATION, DEPTH, DBT_DIBENZO, PHE_PHENA, DBT_BY_PHE, MPI, VRC, Date
  const filterRangesToRender = ['depth', 'dbt_dibenzo', 'phe_phena', 'dbt_by_phe', 'mpi', 'vrc'];

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
              const v = aromaticDataset.variables.find((x) => x.sql_column_name === col);
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
            value={aromaticDataset?.variables.length || 0}
            description="Active variables"
            accentColorClass="border-l-emerald-500"
          />

          {/* KPI 4: Dataset View Name */}
          <KpiCard
            title="Dataset View Name"
            value={`${aromaticDataset?.sql_table_name || ''}_VW`}
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
        {activeTab === 'scientific' && (
          <div className="space-y-6">
            {aromaticDataLoading ? (
              <Card className="p-8 border border-slate-200 shadow-2xs bg-white text-center flex flex-col items-center justify-center min-h-[400px]">
                <Spinner size="lg" />
              </Card>
            ) : !aromaticData || aromaticData.length === 0 ? (
              <Card className="p-8 border border-slate-200 shadow-2xs bg-white text-center flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-4 border border-amber-100 shadow-2xs">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">No data matched current filters</h2>
                <p className="text-slate-500 text-sm mt-2">
                  Please upload aromatic biomarker data in the Dataset Registry or clear the filter selections in the sidebar.
                </p>
              </Card>
            ) : (
              <div className="flex flex-col gap-6 w-full">
                {/* GRAPH 7 — DBT/PHE vs PR/PH */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white">
                  <div className="border-b border-slate-100 pb-3 mb-4">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">DBT/Phe vs Pr/Ph Plot</h4>
                    </div>
                  </div>
                  <div className="w-full h-[580px]">
                    <Plot
                      data={renderAromaticPrPhTraces(combinedAromaticPrPhData)}
                      layout={{
                        ...getCommonLayout('DBT/Phe vs Pr/Ph Plot', 'Pr/Ph', 'DBT/Phe'),
                        xaxis: {
                          title: { text: '<b>Pr/Ph</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0.0, 8.0],
                          tickvals: [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
                          ticktext: ['0.00', '1.00', '2.00', '3.00', '4.00', '5.00', '6.00', '7.00', '8.00'],
                          gridcolor: '#F1F5F9',
                          zeroline: false,
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        yaxis: {
                          title: { text: '<b>DBT/Phe</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0.0, 2.0],
                          tickvals: [0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0],
                          ticktext: ['0', '0.2', '0.4', '0.6', '0.8', '1', '1.2', '1.4', '1.6', '1.8', '2'],
                          gridcolor: '#F1F5F9',
                          zeroline: false,
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        shapes: [
                          {
                            type: 'line',
                            x0: 0,
                            x1: 8.0,
                            y0: 1.0,
                            y1: 1.0,
                            line: { color: '#000000', width: 1.0 }
                          },
                          {
                            type: 'line',
                            x0: 1.0,
                            x1: 1.0,
                            y0: 0,
                            y1: 2.0,
                            line: { color: '#000000', width: 1.0 }
                          },
                          {
                            type: 'line',
                            x0: 3.0,
                            x1: 3.0,
                            y0: 0,
                            y1: 1.0,
                            line: { color: '#000000', width: 1.0 }
                          }
                        ],
                        annotations: [
                          {
                            x: 0.5, y: 1.45, xref: 'x', yref: 'y', text: '<b>Zone-1</b>',
                            showarrow: false, font: { size: 12, color: '#000000', family: 'Inter, sans-serif' }
                          },
                          {
                            x: 0.5, y: 0.85, xref: 'x', yref: 'y', text: '<b>Zone-2</b>',
                            showarrow: false, font: { size: 12, color: '#000000', family: 'Inter, sans-serif' }
                          },
                          {
                            x: 2.0, y: 0.85, xref: 'x', yref: 'y', text: '<b>Zone-3</b>',
                            showarrow: false, font: { size: 12, color: '#000000', family: 'Inter, sans-serif' }
                          },
                          {
                            x: 5.5, y: 0.85, xref: 'x', yref: 'y', text: '<b>Zone-4</b>',
                            showarrow: false, font: { size: 12, color: '#000000', family: 'Inter, sans-serif' }
                          }
                        ],
                        margin: { l: 60, r: 40, t: 60, b: 100 },
                        legend: {
                          orientation: 'h' as any,
                          x: 0.5,
                          y: -0.22,
                          xanchor: 'center',
                          yanchor: 'top',
                          font: { family: 'Inter, sans-serif', size: 10, color: '#475569' },
                          bordercolor: '#cbd5e1',
                          borderwidth: 1
                        }
                      }}
                      useResizeHandler={true}
                      className="w-full h-full"
                      config={{ displayModeBar: 'hover', responsive: true }}
                    />
                  </div>
                </Card>

                {/* GRAPH 8 — NDR vs TMN */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white">
                  <div className="border-b border-slate-100 pb-3 mb-4">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">NDR % vs 1,2,7-TMN/1,3,7-TMN Plot</h4>
                    </div>
                  </div>
                  <div className="w-full h-[580px]">
                    <Plot
                      data={renderNDRTMNTraces(aromaticData)}
                      layout={{
                        ...getCommonLayout('NDR % vs 1,2,7-TMN/1,3,7-TMN', '1,2,7-TMN/1,3,7-TMN', 'NDR %'),
                        xaxis: {
                          title: { text: '<b>1,2,7-TMN/1,3,7-TMN</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0.00, 2.50],
                          tickvals: [0.00, 0.50, 1.00, 1.50, 2.00, 2.50],
                          ticktext: ['0.00', '0.50', '1.00', '1.50', '2.00', '2.50'],
                          gridcolor: '#F1F5F9',
                          zeroline: false,
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        yaxis: {
                          title: { text: '<b>NDR %</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0.00, 1.20],
                          tickvals: [0.00, 0.20, 0.40, 0.60, 0.80, 1.00, 1.20],
                          ticktext: ['0.00', '0.20', '0.40', '0.60', '0.80', '1.00', '1.20'],
                          gridcolor: '#F1F5F9',
                          zeroline: false,
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        annotations: [
                          {
                            x: 1.8,
                            y: 0.70,
                            ax: 1.15,
                            ay: 0.50,
                            xref: 'x',
                            yref: 'y',
                            axref: 'x',
                            ayref: 'y',
                            showarrow: true,
                            arrowhead: 2,
                            arrowsize: 1.2,
                            arrowwidth: 1.5,
                            arrowcolor: '#000000',
                          },
                          {
                            x: 1.45,
                            y: 0.64,
                            xref: 'x',
                            yref: 'y',
                            text: '<b>Decreasing age of source of oil</b>',
                            showarrow: false,
                            font: { family: 'Inter, sans-serif', size: 11, color: '#000000' },
                            textangle: 16
                          }
                        ],
                        margin: { l: 60, r: 40, t: 60, b: 100 },
                        legend: {
                          orientation: 'h' as any,
                          x: 0.5,
                          y: -0.22,
                          xanchor: 'center',
                          yanchor: 'top',
                          font: { family: 'Inter, sans-serif', size: 10, color: '#475569' },
                          bordercolor: '#cbd5e1',
                          borderwidth: 1
                        }
                      }}
                      useResizeHandler={true}
                      className="w-full h-full"
                      config={{ displayModeBar: 'hover', responsive: true }}
                    />
                  </div>
                </Card>

                {/* GRAPH 9 — ETR vs TMN */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white">
                  <div className="border-b border-slate-100 pb-3 mb-4">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">ETR % vs 1,2,7-TMN/1,3,7-TMN Plot</h4>
                    </div>
                  </div>
                  <div className="w-full h-[580px]">
                    <Plot
                      data={renderETRTMNTraces(aromaticData)}
                      layout={{
                        ...getCommonLayout('ETR % vs 1,2,7-TMN/1,3,7-TMN', '1,2,7-TMN/1,3,7-TMN', 'ETR %'),
                        xaxis: {
                          title: { text: '<b>1,2,7-TMN/1,3,7-TMN</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0.00, 3.00],
                          tickvals: [0.00, 0.50, 1.00, 1.50, 2.00, 2.50, 3.00],
                          ticktext: ['0.00', '0.50', '1.00', '1.50', '2.00', '2.50', '3.00'],
                          gridcolor: '#F1F5F9',
                          zeroline: false,
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        yaxis: {
                          title: { text: '<b>ETR %</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0.00, 2.50],
                          tickvals: [0.00, 0.50, 1.00, 1.50, 2.00, 2.50],
                          ticktext: ['0.00', '0.50', '1.00', '1.50', '2.00', '2.50'],
                          gridcolor: '#F1F5F9',
                          zeroline: false,
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        margin: { l: 60, r: 40, t: 60, b: 100 },
                        legend: {
                          orientation: 'h' as any,
                          x: 0.5,
                          y: -0.22,
                          xanchor: 'center',
                          yanchor: 'top',
                          font: { family: 'Inter, sans-serif', size: 10, color: '#475569' },
                          bordercolor: '#cbd5e1',
                          borderwidth: 1
                        }
                      }}
                      useResizeHandler={true}
                      className="w-full h-full"
                      config={{ displayModeBar: 'hover', responsive: true }}
                    />
                  </div>
                </Card>

                <DashboardDatasetTable
                  title="Aromatic Biomarker Dataset Records"
                  data={aromaticData}
                  variables={aromaticDataset?.variables}
                  isLoading={aromaticDataLoading}
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
