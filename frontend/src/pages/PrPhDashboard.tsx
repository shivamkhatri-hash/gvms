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

const WellMarker: React.FC<{ symbol: string; color: string }> = ({ symbol, color }) => {
  const size = "14";
  const strokeWidth = "2";
  switch (symbol) {
    case 'circle':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <circle cx="12" cy="12" r="8" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'square':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <rect x="4" y="4" width="16" height="16" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'triangle-up':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <polygon points="12,3 21,20 3,20" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'triangle-down':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <polygon points="12,21 3,4 21,4" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'diamond':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <polygon points="12,2 22,12 12,22 2,12" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'x':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <line x1="4" y1="4" x2="20" y2="20" stroke={color} strokeWidth={strokeWidth} />
          <line x1="20" y1="4" x2="4" y2="20" stroke={color} strokeWidth={strokeWidth} />
        </svg>
      );
    case 'cross':
    case 'plus':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <line x1="12" y1="4" x2="12" y2="20" stroke={color} strokeWidth={strokeWidth} />
          <line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={strokeWidth} />
        </svg>
      );
    case 'asterisk':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <line x1="12" y1="4" x2="12" y2="20" stroke={color} strokeWidth={strokeWidth} />
          <line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={strokeWidth} />
          <line x1="6.34" y1="6.34" x2="17.66" y2="17.66" stroke={color} strokeWidth={strokeWidth} />
          <line x1="17.66" y1="6.34" x2="6.34" y2="17.66" stroke={color} strokeWidth={strokeWidth} />
        </svg>
      );
    case 'star':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'pentagon':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <polygon points="12,2 22,9 18,21 6,21 2,9" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'hexagram':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <polygon points="12,2 15,9 22,9 18,14 20,21 12,17 4,21 6,14 2,9 9,9" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'triangle-left':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <polygon points="3,12 20,3 20,21" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'triangle-right':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <polygon points="21,12 4,3 4,21" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'hourglass':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <polygon points="4,4 20,4 12,12 20,20 4,20 12,12" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'bowtie':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <polygon points="4,4 4,20 12,12 20,20 20,4 12,12" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
    case 'diamond-cross':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <polygon points="12,2 22,12 12,22 2,12" fill={color} stroke="#ffffff" strokeWidth="0.5" />
          <line x1="12" y1="4" x2="12" y2="20" stroke="#ffffff" strokeWidth="1" />
          <line x1="4" y1="12" x2="20" y2="12" stroke="#ffffff" strokeWidth="1" />
        </svg>
      );
    case 'circle-cross':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <circle cx="12" cy="12" r="8" fill={color} stroke="#ffffff" strokeWidth="0.5" />
          <line x1="12" y1="6" x2="12" y2="18" stroke="#ffffff" strokeWidth="1" />
          <line x1="6" y1="12" x2="18" y2="12" stroke="#ffffff" strokeWidth="1" />
        </svg>
      );
    case 'square-cross':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <rect x="4" y="4" width="16" height="16" fill={color} stroke="#ffffff" strokeWidth="0.5" />
          <line x1="12" y1="4" x2="12" y2="20" stroke="#ffffff" strokeWidth="1" />
          <line x1="4" y1="12" x2="20" y2="12" stroke="#ffffff" strokeWidth="1" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block flex-shrink-0">
          <circle cx="12" cy="12" r="8" fill={color} stroke="#ffffff" strokeWidth="0.5" />
        </svg>
      );
  }
};

export const PrPhDashboard: React.FC = () => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  
  // Custom builder states
  const [xVar, setXVar] = useState<string>('depth');
  const [yVar, setYVar] = useState<string>('pr_by_ph');
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

  const prPhDataset = datasets?.find((d) => d.name === 'pr_ph');
  const steraneDataset = datasets?.find((d) => d.name === 'sterane');
  const aromaticDataset = datasets?.find((d) => d.name === 'aromatic_biomarkers');

  useEffect(() => {
    if (prPhDataset) {
      setSelectedDatasetId(prPhDataset.id);
    }
  }, [prPhDataset]);

  // Set default axes when variables load
  useEffect(() => {
    if (prPhDataset?.variables) {
      const numericVars = prPhDataset.variables.filter((v) => v.is_numeric);
      if (numericVars.length >= 2) {
        setXVar(numericVars[0].sql_column_name);
        setYVar(numericVars[1].sql_column_name);
      }
    }
  }, [prPhDataset]);

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

  // 5. Fetch All Filtered Pr/Ph Records for Scientific Dashboard
  const { data: prPhData, isLoading: prPhDataLoading, refetch: refetchPrPh } = useQuery<any[]>({
    queryKey: ['scientific-plots-data-prph', selectedDatasetId, serializedFilters],
    queryFn: () =>
      api.get<any[]>('/dashboard/scientific-plots', {
        params: {
          dataset_id: selectedDatasetId,
          ...serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  // Fetch All Filtered Sterane Records for scientific plots join
  const { data: steraneData, isLoading: steraneDataLoading, refetch: refetchSterane } = useQuery<any[]>({
    queryKey: ['scientific-plots-data-sterane', steraneDataset?.id, serializedFilters],
    queryFn: () =>
      api.get<any[]>('/dashboard/scientific-plots', {
        params: {
          dataset_id: steraneDataset?.id,
          ...serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!steraneDataset?.id,
  });

  // Fetch All Filtered Aromatic Records for scientific plots join
  const { data: aromaticData, isLoading: aromaticDataLoading, refetch: refetchAromatic } = useQuery<any[]>({
    queryKey: ['scientific-plots-data-aromatic', aromaticDataset?.id, serializedFilters],
    queryFn: () =>
      api.get<any[]>('/dashboard/scientific-plots', {
        params: {
          dataset_id: aromaticDataset?.id,
          ...serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!aromaticDataset?.id,
  });

  const aromaticPrPhWells = React.useMemo(() => {
    if (!prPhData || !aromaticData) return [];
    const wellsSet = new Set<string>();
    prPhData.forEach(pRow => {
      const well = pRow.name || 'Unknown';
      const depth = parseFloat(pRow.depth);
      const arRow = aromaticData.find(ar => 
        String(ar.name).trim().toUpperCase() === well.trim().toUpperCase() &&
        (isNaN(depth) || isNaN(parseFloat(ar.depth)) || Math.abs(parseFloat(ar.depth) - depth) < 1.5)
      );
      if (arRow) {
        const xVal = parseFloat(pRow.pr_by_ph);
        const yVal = parseFloat(arRow.dbt_by_phe);
        if (!isNaN(xVal) && !isNaN(yVal)) {
          wellsSet.add(well);
        }
      }
    });
    return Array.from(wellsSet).sort();
  }, [prPhData, aromaticData]);

  const handleRefreshAll = () => {
    refetchStats();
    refetchChart();
    refetchPrPh();
    refetchSterane();
    refetchAromatic();
  };

  // Style registry matching scientific standards for Wells A to R
  const getWellStyle = (well: string) => {
    const name = String(well).trim().toUpperCase();
    const styles: Record<string, { color: string, symbol: string }> = {
      'A': { color: '#22c55e', symbol: 'triangle-up' },
      'B': { color: '#b91c1c', symbol: 'square' },
      'C': { color: '#a855f7', symbol: 'x' },
      'D': { color: '#0ea5e9', symbol: 'asterisk' },
      'E': { color: '#f59e0b', symbol: 'circle' },
      'F': { color: '#ec4899', symbol: 'diamond' },
      'G': { color: '#10b981', symbol: 'triangle-down' },
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

  // Generate traces for Pr/Ph vs Sterane C27R/(C27R+C29R) Plot
  const renderPrPhSteraneTraces = (prData: any[], sterData: any[]) => {
    if (!prData || !sterData) return [];

    const combined: any[] = [];
    prData.forEach(pRow => {
      const well = pRow.name || 'Unknown';
      const depth = parseFloat(pRow.depth);
      
      const sRow = sterData.find(st => 
        String(st.name).trim().toUpperCase() === well.trim().toUpperCase() &&
        (isNaN(depth) || isNaN(parseFloat(st.depth_top)) || Math.abs(parseFloat(st.depth_top) - depth) < 1.5)
      );
      if (sRow) {
        const xVal = parseFloat(pRow.pr_by_ph);
        const c27 = parseFloat(sRow.c27_sterane_r);
        const c29 = parseFloat(sRow.c29_sterane_r);
        
        if (!isNaN(xVal) && !isNaN(c27) && !isNaN(c29) && (c27 + c29) > 0) {
          const yVal = c27 / (c27 + c29);
          combined.push({
            well,
            x: xVal,
            y: yVal,
            depth: pRow.depth || 'N/A',
            formation: pRow.formation || 'N/A',
            object: pRow.object || 'N/A'
          });
        }
      }
    });

    const groups: Record<string, any[]> = {};
    combined.forEach(p => {
      if (!groups[p.well]) groups[p.well] = [];
      groups[p.well].push(p);
    });

    const sortedWells = Object.keys(groups).sort();
    return sortedWells.map(well => {
      const pts = groups[well];
      const style = getWellStyle(well);
      return {
        x: pts.map(p => p.x),
        y: pts.map(p => p.y),
        mode: 'markers',
        name: well,
        marker: { 
          size: 10, 
          color: style.color, 
          symbol: style.symbol,
          line: { width: 0.5, color: 'white' }
        },
        text: pts.map(p => `<b>Well Name:</b> ${well}<br><b>Depth:</b> ${p.depth} m<br><b>Formation:</b> ${p.formation}<br><b>Pr/Ph:</b> ${p.x.toFixed(3)}<br><b>Sterane C27R/(C27R+C29R):</b> ${p.y.toFixed(3)}`),
        hovertemplate: '%{text}<extra></extra>'
      };
    });
  };

  // Generate Plotly traces for DBT/Phe vs Pr/Ph Plot with background zones & explanations as legend
  const renderAromaticPrPhTraces = (prData: any[], arData: any[]) => {
    if (!prData || !arData) return [];

    const combined: any[] = [];
    prData.forEach(pRow => {
      const well = pRow.name || 'Unknown';
      const depth = parseFloat(pRow.depth);
      
      const arRow = arData.find(ar => 
        String(ar.name).trim().toUpperCase() === well.trim().toUpperCase() &&
        (isNaN(depth) || isNaN(parseFloat(ar.depth)) || Math.abs(parseFloat(ar.depth) - depth) < 1.5)
      );
      if (arRow) {
        const xVal = parseFloat(pRow.pr_by_ph);
        const yVal = parseFloat(arRow.dbt_by_phe);
        
        if (!isNaN(xVal) && !isNaN(yVal)) {
          combined.push({
            well,
            x: xVal,
            y: yVal,
            depth: pRow.depth || 'N/A',
            formation: pRow.formation || 'N/A',
            object: pRow.object || 'N/A'
          });
        }
      }
    });

    const groups: Record<string, any[]> = {};
    combined.forEach(p => {
      if (!groups[p.well]) groups[p.well] = [];
      groups[p.well].push(p);
    });

    const sortedWells = Object.keys(groups).sort();
    const dataTraces = sortedWells.map(well => {
      const pts = groups[well];
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
        hovertemplate: '%{text}<extra></extra>'
      };
    });

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

    return [...backgroundTraces, ...dataTraces];
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

  if (!prPhDataset) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
            <h3 className="text-red-800 font-bold">Pristane / Phytane Dataset Not Registered</h3>
          </div>
          <p className="text-red-700 text-sm mt-2">
            Please run the database migrations and check the backend container startup seeding logs to register the dataset.
          </p>
        </div>
      </div>
    );
  }

  // Extracted lists for filter display
  const numericVars = prPhDataset.variables.filter((v) => v.is_numeric);
  const categoricalVars = prPhDataset.variables.filter((v) => !v.is_numeric && !['id', 'remarks', 'analysed_at', 'insert_user', 'insert_date', 'update_user', 'update_date', 'uploaded_by'].includes(v.sql_column_name));

  // Filters required: UBHI, NAME, FORMATION, OBJECT, DEPTH, PRISTANE, PHYTANE, PR_BY_PH
  const filterRangesToRender = ['depth', 'pristane', 'phytane', 'pr_by_ph'];

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
              const v = prPhDataset.variables.find((x) => x.sql_column_name === col);
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
          <KpiCard
            title="Total Samples"
            value={statsLoading ? '...' : stats?.total_samples || 0}
            description="Ingested records"
            accentColorClass="border-l-ongc-blue"
          />

          <KpiCard
            title="Unique Wells"
            value={statsLoading ? '...' : stats?.total_wells || 0}
            description="Unique boreholes"
            accentColorClass="border-l-amber-500"
          />

          <KpiCard
            title="Registered Variables"
            value={prPhDataset?.variables.length || 0}
            description="Active variables"
            accentColorClass="border-l-emerald-500"
          />

          <KpiCard
            title="Dataset View Name"
            value={`${prPhDataset?.sql_table_name || ''}_VW`}
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
            {prPhDataLoading ? (
              <div className="flex justify-center items-center h-64">
                <Spinner size="lg" />
              </div>
            ) : !prPhData || prPhData.length === 0 ? (
              <Card className="p-8 text-center bg-white border border-slate-200">
                <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                <h3 className="text-slate-800 font-bold">No Data Available</h3>
                <p className="text-slate-500 text-sm mt-1">
                  Please upload some data for the Pristane / Phytane dataset or adjust your filter selections.
                </p>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Joined Graph: Pr/Ph vs Sterane C27R/(C27R+C29R) */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">Pristane/Phytane vs Sterane Ratio Source-Rock Facies</h4>
                    </div>
                  </div>
                  <div className="p-0 w-full h-[760px]">
                    {steraneDataLoading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Spinner size="lg" />
                      </div>
                    ) : (
                      <Plot
                        data={renderPrPhSteraneTraces(prPhData || [], steraneData || [])}
                        layout={{
                          ...getCommonLayout(
                            'Pristane/Phytane vs Sterane Ratio Source-Rock Facies',
                            'Pr/Ph',
                            'Sterane C27R/(C27R+C29R)'
                          ),
                          xaxis: {
                            title: { text: '<b>Pr/Ph</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                            range: [0.0, 7.0],
                            tickvals: [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0],
                            ticktext: ['0.00', '1.00', '2.00', '3.00', '4.00', '5.00', '6.00', '7.00'],
                            gridcolor: '#F1F5F9',
                            zeroline: false,
                            showline: true,
                            mirror: true,
                            linecolor: '#000000',
                            linewidth: 2
                          },
                          yaxis: {
                            title: { text: '<b>Sterane C<sub>27</sub>R/(C<sub>27</sub>R+C<sub>29</sub>R)</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                            range: [0.0, 1.0],
                            tickvals: [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
                            ticktext: ['0', '0.2', '0.4', '0.6', '0.8', '1'],
                            gridcolor: '#F1F5F9',
                            zeroline: false,
                            showline: true,
                            mirror: true,
                            linecolor: '#000000',
                            linewidth: 2,
                            scaleanchor: 'x',
                            scaleratio: 5.0,
                            constrain: 'domain'
                          },
                          shapes: [
                            // Vertical dashed line at X = 2.0 extending full height of plot domain
                            {
                              type: 'line',
                              yref: 'paper',
                              x0: 2.0,
                              x1: 2.0,
                              y0: 0,
                              y1: 1,
                              line: { color: '#000000', width: 1.0, dash: 'dash' }
                            },
                            // Horizontal dashed line at Y = 0.45 extending full width of plot domain
                            {
                              type: 'line',
                              xref: 'paper',
                              x0: 0,
                              x1: 1,
                              y0: 0.45,
                              y1: 0.45,
                              line: { color: '#000000', width: 1.0, dash: 'dash' }
                            }
                          ],
                          annotations: [
                            {
                              x: 1.0,
                              y: 0.725,
                              xref: 'x',
                              yref: 'y',
                              text: 'Pelagic<br>Anoxic',
                              showarrow: false,
                              font: { family: 'Inter, sans-serif', size: 12, color: '#0F172A' },
                              align: 'center',
                              xanchor: 'center'
                            },
                            {
                              x: 4.5,
                              y: 0.725,
                              xref: 'x',
                              yref: 'y',
                              text: 'Pelagic<br>Oxic',
                              showarrow: false,
                              font: { family: 'Inter, sans-serif', size: 12, color: '#0F172A' },
                              align: 'center',
                              xanchor: 'center'
                            },
                            {
                              x: 1.0,
                              y: 0.225,
                              xref: 'x',
                              yref: 'y',
                              text: 'Terrestrial/Coastal<br>Anoxic',
                              showarrow: false,
                              font: { family: 'Inter, sans-serif', size: 12, color: '#0F172A' },
                              align: 'center',
                              xanchor: 'center'
                            },
                            {
                              x: 4.5,
                              y: 0.225,
                              xref: 'x',
                              yref: 'y',
                              text: 'Terrestrial/Coastal Oxic',
                              showarrow: false,
                              font: { family: 'Inter, sans-serif', size: 12, color: '#0F172A' },
                              align: 'center',
                              xanchor: 'center'
                            }
                          ],
                          margin: { l: 60, r: 40, t: 60, b: 100 },
                          showlegend: true,
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
                        config={{ responsive: true, displayModeBar: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    )}
                  </div>
                </Card>

                {/* Joined Graph 2: DBT/Phe vs Pr/Ph */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">DBT/Phe vs Pr/Ph Plot</h4>
                    </div>
                  </div>
                  <div className="p-0 w-full h-[600px]">
                    {aromaticDataLoading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Spinner size="lg" />
                      </div>
                    ) : (
                      <Plot
                        data={renderAromaticPrPhTraces(prPhData || [], aromaticData || [])}
                        layout={{
                          ...getCommonLayout(
                            'DBT/Phe vs Pr/Ph Plot',
                            'Pr/Ph',
                            'DBT/Phe'
                          ),
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
                            // Vertical boundary line at X = 1.0
                            {
                              type: 'line',
                              x0: 1.0,
                              x1: 1.0,
                              y0: 0,
                              y1: 2.0,
                              line: { color: '#000000', width: 1.0 }
                            },
                            // Vertical boundary line at X = 3.0
                            {
                              type: 'line',
                              x0: 3.0,
                              x1: 3.0,
                              y0: 0,
                              y1: 1.0,
                              line: { color: '#000000', width: 1.0 }
                            },
                            // Horizontal boundary line at Y = 1.0
                            {
                              type: 'line',
                              x0: 0,
                              x1: 8.0,
                              y0: 1.0,
                              y1: 1.0,
                              line: { color: '#000000', width: 1.0 }
                            }
                          ],
                          annotations: [
                            {
                              x: 0.5,
                              y: 1.45,
                              xref: 'x',
                              yref: 'y',
                              text: '<b>Zone-1</b>',
                              showarrow: false,
                              font: { family: 'Inter, sans-serif', size: 12, color: '#000000' }
                            },
                            {
                              x: 0.5,
                              y: 0.85,
                              xref: 'x',
                              yref: 'y',
                              text: '<b>Zone-2</b>',
                              showarrow: false,
                              font: { family: 'Inter, sans-serif', size: 12, color: '#000000' }
                            },
                            {
                              x: 2.0,
                              y: 0.85,
                              xref: 'x',
                              yref: 'y',
                              text: '<b>Zone-3</b>',
                              showarrow: false,
                              font: { family: 'Inter, sans-serif', size: 12, color: '#000000' }
                            },
                            {
                              x: 5.5,
                              y: 0.85,
                              xref: 'x',
                              yref: 'y',
                              text: '<b>Zone-4</b>',
                              showarrow: false,
                              font: { family: 'Inter, sans-serif', size: 12, color: '#000000' }
                            }
                          ],
                          margin: { l: 60, r: 40, t: 40, b: 100 },
                          showlegend: true,
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
                        config={{ responsive: true, displayModeBar: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    )}
                  </div>
                </Card>

                <DashboardDatasetTable
                  title="Pristane/Phytane Biomarker Dataset Records"
                  data={prPhData}
                  variables={prPhDataset?.variables}
                  isLoading={prPhDataLoading}
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

export default PrPhDashboard;
