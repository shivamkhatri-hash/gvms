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

export const HopaneDashboard: React.FC = () => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  
  // Custom builder states
  const [xVar, setXVar] = useState<string>('depth_top');
  const [yVar, setYVar] = useState<string>('total_hh');
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

  const hopaneDataset = datasets?.find((d) => d.name === 'hopane');
  const steraneDataset = datasets?.find((d) => d.name === 'sterane');

  useEffect(() => {
    if (hopaneDataset) {
      setSelectedDatasetId(hopaneDataset.id);
    }
  }, [hopaneDataset]);

  // Set default axes when variables load
  useEffect(() => {
    if (hopaneDataset?.variables) {
      const numericVars = hopaneDataset.variables.filter((v) => v.is_numeric);
      if (numericVars.length >= 2) {
        setXVar(numericVars[0].sql_column_name);
        setYVar(numericVars[1].sql_column_name);
      }
    }
  }, [hopaneDataset]);

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

  // 5. Fetch All Filtered Hopane Records for Scientific Dashboard
  const { data: hopaneData, isLoading: hopaneDataLoading, refetch: refetchHopane } = useQuery<any[]>({
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

  // Fetch All Filtered Sterane Records for Scientific Dashboard join
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

  const handleRefreshAll = () => {
    refetchStats();
    refetchChart();
    refetchHopane();
    refetchSterane();
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

  if (!hopaneDataset) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
            <h3 className="text-red-800 font-bold">Hopane Dataset Not Registered</h3>
          </div>
          <p className="text-red-700 text-sm mt-2">
            Please run the database migrations and check the backend container startup seeding logs to register the dataset.
          </p>
        </div>
      </div>
    );
  }

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

  const getWellStyle = (well: string) => {
    const name = String(well).trim().toUpperCase();
    const styles: Record<string, { color: string, symbol: string, line?: { color: string, width: number } }> = {
      'A': { color: '#2563eb', symbol: 'circle' },
      'B': { color: '#2563eb', symbol: 'diamond' },
      'C': { color: '#2563eb', symbol: 'triangle-up' },
      'D': { color: '#2563eb', symbol: 'square' },
      'E': { color: '#1e3a8a', symbol: 'triangle-up' },
      'F': { color: '#38bdf8', symbol: 'square-open' },
      'G': { color: '#38bdf8', symbol: 'diamond-open' },
      'H': { color: '#0d9488', symbol: 'triangle-up' },
      'I': { color: '#0d9488', symbol: 'diamond' },
      'J': { color: '#0d9488', symbol: 'circle' },
      'K': { color: '#0f766e', symbol: 'line-ew' },
      'L': { color: '#0ea5e9', symbol: 'x' },
      'M': { color: '#0f766e', symbol: 'asterisk' },
      'N': { color: '#ea580c', symbol: 'x' },
      'O': { color: '#b91c1c', symbol: 'square' },
      'P': { color: '#000000', symbol: 'square', line: { color: '#2563eb', width: 1.5 } },
      'Q': { color: '#000000', symbol: 'square', line: { color: '#b91c1c', width: 1.5 } },
      'R': { color: '#a3e635', symbol: 'circle' }
    };
    return styles[name] || { color: '#64748b', symbol: 'circle' };
  };

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

  // 1a. HH Radar Plot Traces
  const renderHomohopanesRadarTraces = (validData: any[]) => {
    return validData.map(row => {
      const v31 = parseFloat(row.perc_c31hh);
      const v32 = parseFloat(row.perc_c32hh);
      const v33 = parseFloat(row.perc_c33hh);
      const v34 = parseFloat(row.perc_c34hh);
      const v35 = parseFloat(row.perc_c35hh);
      
      const rValues = [
        isNaN(v31) ? 0 : v31,
        isNaN(v32) ? 0 : v32,
        isNaN(v33) ? 0 : v33,
        isNaN(v34) ? 0 : v34,
        isNaN(v35) ? 0 : v35,
        isNaN(v31) ? 0 : v31 // closed path
      ];
      const thetaValues = ['%C31HH', '%C32HH', '%C33HH', '%C34HH', '%C35HH', '%C31HH'];

      const well = row.name || 'Unknown Well';
      const depth = row.depth_top || 'N/A';
      const style = getWellStyle(well);
      const isDashed = style.symbol.includes('open') || style.symbol === 'x' || style.symbol === 'square-open' || style.symbol === 'diamond-open';
      const isDotted = style.symbol === 'asterisk' || style.symbol === 'line-ew';
      
      return {
        type: 'scatterpolar' as any,
        r: rValues,
        theta: thetaValues,
        mode: 'lines' as any,
        name: well,
        line: { 
          color: style.color, 
          width: 2,
          dash: isDashed ? 'dash' : isDotted ? 'dot' : 'solid'
        },
        hoverinfo: 'all' as any,
        text: `<b>Well:</b> ${well}<br><b>Depth:</b> ${depth} m<br><b>%C31HH:</b> ${isNaN(v31) ? 'N/A' : v31.toFixed(2)}%<br><b>%C32HH:</b> ${isNaN(v32) ? 'N/A' : v32.toFixed(2)}%<br><b>%C33HH:</b> ${isNaN(v33) ? 'N/A' : v33.toFixed(2)}%<br><b>%C34HH:</b> ${isNaN(v34) ? 'N/A' : v34.toFixed(2)}%<br><b>%C35HH:</b> ${isNaN(v35) ? 'N/A' : v35.toFixed(2)}%`,
        hovertemplate: '%{text}<extra></extra>',
        customdata: row
      };
    });
  };

  // 1b. HH Line Plot Traces
  const renderHomohopanesHHPlotTraces = (validData: any[]) => {
    return validData.map(row => {
      const v31 = parseFloat(row.perc_c31hh);
      const v32 = parseFloat(row.perc_c32hh);
      const v33 = parseFloat(row.perc_c33hh);
      const v34 = parseFloat(row.perc_c34hh);
      const v35 = parseFloat(row.perc_c35hh);
      
      const yValues = [v31, v32, v33, v34, v35];
      const xValues = ['%C31HH', '%C32HH', '%C33HH', '%C34HH', '%C35HH'];

      const well = row.name || 'Unknown Well';
      const depth = row.depth_top || 'N/A';
      const formation = row.formation || 'N/A';
      const object = row.object_no || 'N/A';
      const style = getWellStyle(well);
      const isDashed = style.symbol.includes('open') || style.symbol === 'x' || style.symbol === 'square-open' || style.symbol === 'diamond-open';
      const isDotted = style.symbol === 'asterisk' || style.symbol === 'line-ew';
      
      return {
        type: 'scatter' as any,
        x: xValues,
        y: yValues,
        mode: 'lines+markers' as any,
        name: well,
        line: { 
          color: style.color, 
          width: 2, 
          shape: 'linear' as any,
          dash: isDashed ? 'dash' : isDotted ? 'dot' : 'solid'
        },
        marker: { 
          size: 6, 
          color: style.color, 
          symbol: style.symbol.replace('-open', ''),
          line: style.line 
        },
        text: `<b>Well:</b> ${well}<br><b>Depth:</b> ${depth} m<br><b>Formation:</b> ${formation}<br><b>Object:</b> ${object}<br><b>%C31HH:</b> ${isNaN(v31) ? 'N/A' : v31.toFixed(2)}%<br><b>%C32HH:</b> ${isNaN(v32) ? 'N/A' : v32.toFixed(2)}%<br><b>%C33HH:</b> ${isNaN(v33) ? 'N/A' : v33.toFixed(2)}%<br><b>%C34HH:</b> ${isNaN(v34) ? 'N/A' : v34.toFixed(2)}%<br><b>%C35HH:</b> ${isNaN(v35) ? 'N/A' : v35.toFixed(2)}%`,
        hovertemplate: '%{text}<extra></extra>',
        customdata: row
      };
    });
  };

  // 2. DiaH vs C29H/C30H Traces
  const renderDiaHTraces = (validData: any[]) => {
    const traces: any[] = [];

    // Left ellipse: Siliciclastic / Clay-rich
    const leftEllipse = getEllipseCoords(0.15, 0.69, 0.16, 0.29, 8);
    traces.push({
      x: leftEllipse.x,
      y: leftEllipse.y,
      mode: 'lines',
      name: 'Siliciclastic / Clay-rich',
      line: { color: 'rgba(15, 23, 42, 0.65)', width: 1, dash: 'solid' },
      showlegend: false,
      hoverinfo: 'skip'
    });

    // Right ellipse: Carbonate / Clay-poor
    const rightEllipse = getEllipseCoords(0.65, 0.67, 0.14, 0.30, -35);
    traces.push({
      x: rightEllipse.x,
      y: rightEllipse.y,
      mode: 'lines',
      name: 'Carbonate / Clay-poor',
      line: { color: 'rgba(15, 23, 42, 0.65)', width: 1, dash: 'solid' },
      showlegend: false,
      hoverinfo: 'skip'
    });

    // Data points grouped by well
    const groups: Record<string, any[]> = {};
    validData.forEach(row => {
      const xVal = parseFloat(row.diahopane_index);
      const yVal = parseFloat(row.c29h_by_c30h);
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

    // Sort wells alphabetically so they appear consistently in legend
    const sortedWells = Object.keys(groups).sort();
    sortedWells.forEach(well => {
      const pts = groups[well];
      const style = getWellStyle(well);
      traces.push({
        x: pts.map(p => p.x),
        y: pts.map(p => p.y),
        mode: 'markers',
        name: well,
        marker: { 
          size: 9, 
          color: style.color, 
          symbol: style.symbol,
          line: style.line || { width: 0.5, color: 'white' }
        },
        text: pts.map(p => `<b>Well Name:</b> ${well}<br><b>Depth:</b> ${p.depth} m<br><b>Formation:</b> ${p.formation}<br><b>Object:</b> ${p.object}<br><b>Diahopane Index:</b> ${p.x.toFixed(3)}<br><b>C29H/C30H:</b> ${p.y.toFixed(3)}`),
        hovertemplate: '%{text}<extra></extra>'
      });
    });

    return traces;
  };

  // 3. C35S/C34S vs C29H/C30H Traces
  const render3534HHTraces = (validData: any[]) => {
    const groups: Record<string, any[]> = {};
    validData.forEach(row => {
      const xVal = parseFloat(row.c29h_by_c30h);
      const yVal = parseFloat(row.c35_s_by_c34_s);
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
          size: 9, 
          color: style.color, 
          symbol: style.symbol,
          line: style.line || { width: 0.5, color: 'white' }
        },
        text: pts.map(p => `<b>Well Name:</b> ${well}<br><b>Depth:</b> ${p.depth} m<br><b>Formation:</b> ${p.formation}<br><b>Object:</b> ${p.object}<br><b>C29H/C30H:</b> ${p.x.toFixed(3)}<br><b>C35S/C34S:</b> ${p.y.toFixed(3)}`),
        hovertemplate: '%{text}<extra></extra>'
      };
    });
  };

  // 4. Oleanane & BCD Index Traces
  const renderOleananeBCDTraces = (validData: any[]) => {
    const wellMap: Record<string, { bcd: number[]; ole: number[] }> = {};
    validData.forEach(row => {
      const well = row.name || 'Unknown';
      const bcd = parseFloat(row.bcd_index);
      const ole = parseFloat(row.oleanane_index);
      
      if (!wellMap[well]) {
        wellMap[well] = { bcd: [], ole: [] };
      }
      if (!isNaN(bcd)) wellMap[well].bcd.push(bcd);
      if (!isNaN(ole)) wellMap[well].ole.push(ole);
    });

    const wells = Object.keys(wellMap).sort();
    const avgBCD = wells.map(w => {
      const vals = wellMap[w].bcd;
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    const avgOle = wells.map(w => {
      const vals = wellMap[w].ole;
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });

    return [
      {
        x: wells,
        y: avgBCD,
        type: 'bar' as any,
        name: 'BCD INDEX',
        marker: { color: 'rgb(0, 176, 80)' }
      },
      {
        x: wells,
        y: avgOle,
        type: 'bar' as any,
        name: 'Oleanane Index',
        marker: { color: 'rgb(192, 0, 0)' }
      }
    ];
  };

  // 5. C29H/C30H vs C29 Diasterane Index (joined from Sterane DB)
  const render29HDiasteraneTraces = (hopData: any[], sterData: any[]) => {
    if (!hopData || !sterData) return [];
    
    const combined: any[] = [];
    hopData.forEach(hRow => {
      const well = hRow.name || 'Unknown';
      const depthH = parseFloat(hRow.depth_top);
      if (isNaN(depthH)) return;
      
      const sRow = sterData.find(st => 
        String(st.name).trim().toUpperCase() === well.trim().toUpperCase() &&
        Math.abs(parseFloat(st.depth_top) - depthH) < 1.5
      );
      if (sRow) {
        const xVal = parseFloat(sRow.c29_diasterane_index);
        const yVal = parseFloat(hRow.c29h_by_c30h);
        if (!isNaN(xVal) && !isNaN(yVal)) {
          combined.push({
            well,
            x: xVal,
            y: yVal,
            depth: hRow.depth_top || 'N/A',
            formation: hRow.formation || 'N/A',
            object: hRow.object_no || 'N/A'
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
          size: 9, 
          color: style.color, 
          symbol: style.symbol,
          line: style.line || { width: 0.5, color: 'white' }
        },
        text: pts.map(p => `<b>Well Name:</b> ${well}<br><b>Depth:</b> ${p.depth} m<br><b>Formation:</b> ${p.formation}<br><b>Object:</b> ${p.object}<br><b>C29 Diasterane Index:</b> ${p.x.toFixed(3)}<br><b>C29H/C30H:</b> ${p.y.toFixed(3)}`),
        hovertemplate: '%{text}<extra></extra>'
      };
    });
  };

  // Common Layout Generator matching LIMS dashboard visual guidelines
  const getCommonLayout = (titleText: string, xAxisTitle: string, yAxisTitle: string, isCategoricalX = false) => applyGlobalLayoutDefaults({
    title: {
      text: `<b>${titleText}</b>`,
      font: { family: 'Inter, sans-serif', size: 15, color: '#0F172A' }
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
  const numericVars = hopaneDataset.variables.filter((v) => v.is_numeric);
  const categoricalVars = hopaneDataset.variables.filter((v) => !v.is_numeric && !['id', 'remarks', 'insert_user', 'insert_date', 'update_user', 'update_date', 'uploaded_by'].includes(v.sql_column_name));

  // Hopane filters list from requirement: UBHI, NAME, FORMATION, OBJECT_NO, DEPTH_TOP, DEPTH_BOTTOM, TOTAL_HH, HOMOHOPANE_INDEX, OLEANANE_INDEX, BCD_INDEX, BNH_INDEX, TM_BY_TS, Date
  const filterRangesToRender = ['depth_top', 'depth_bottom', 'total_hh', 'homohopane_index', 'oleanane_index', 'bcd_index', 'bnh_index', 'tm_by_ts'];

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
              const v = hopaneDataset.variables.find((x) => x.sql_column_name === col);
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
            value={hopaneDataset?.variables.length || 0}
            description="Active variables"
            accentColorClass="border-l-emerald-500"
          />

          {/* KPI 4: Dataset Module */}
          <KpiCard
            title="Dataset Module"
            value={hopaneDataset?.module || ''}
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
          <div className="space-y-6 flex flex-col">
            {hopaneDataLoading ? (
              <Card className="p-8 border border-slate-200 shadow-2xs bg-white flex items-center justify-center min-h-[400px]">
                <Spinner size="lg" />
              </Card>
            ) : !hopaneData || hopaneData.length === 0 ? (
              <Card className="p-8 border border-slate-200 shadow-2xs bg-white text-center flex flex-col items-center justify-center min-h-[400px]">
                <Database className="w-12 h-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-bold text-slate-700">No Hopane Data Found</h3>
                <p className="text-slate-500 text-sm mt-1">Try resetting your filters or check if you have uploaded a valid dataset.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Graph 1: RADAR CHART */}
                {/* Graph 1a: RADAR CHART */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">Homohopane Distribution (Radar Plot)</h4>
                    </div>
                  </div>
                  <div className="p-0 w-full h-[760px]">
                    <Plot
                      data={renderHomohopanesRadarTraces(hopaneData)}
                      layout={{
                        plot_bgcolor: 'white',
                        paper_bgcolor: 'white',
                        polar: {
                          radialaxis: {
                            visible: true,
                            range: [0, 45],
                            dtick: 5,
                            tickformat: '.2f',
                            tickfont: { size: 10, color: '#000000', weight: 'bold' as any },
                            angle: 90,
                            gridcolor: '#CBD5E1',
                            showline: false
                          },
                          angularaxis: {
                            direction: 'clockwise',
                            rotation: 90,
                            gridcolor: '#CBD5E1',
                            tickfont: { size: 11, color: '#000000', weight: 'bold' as any }
                          }
                        },
                        margin: { l: 60, r: 60, t: 60, b: 60 },
                        showlegend: true,
                        legend: {
                          font: { family: 'Inter, sans-serif', size: 10, color: '#475569' },
                          orientation: 'v' as any,
                          y: 0.5,
                          x: 1.05,
                          yanchor: 'middle' as any,
                          xanchor: 'left' as any
                        }
                      }}
                      config={{ responsive: true, displayModeBar: true }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                </Card>

                {/* Graph 1b: LINE PLOT */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">Homohopane Distribution (Line Plot)</h4>
                    </div>
                  </div>
                  <div className="p-5 w-full h-[550px]">
                    <Plot
                      data={renderHomohopanesHHPlotTraces(hopaneData)}
                      layout={{
                        plot_bgcolor: 'white',
                        paper_bgcolor: 'white',
                        xaxis: {
                          title: { text: '<b>Homohopanes</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          showgrid: false,
                          showline: true,
                          mirror: false,
                          linecolor: '#000000',
                          linewidth: 1.5,
                          tickfont: { size: 11, color: '#475569', weight: 'bold' as any }
                        },
                        yaxis: {
                          title: { text: '<b>Percentage (%)</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0, 45],
                          dtick: 5,
                          tickformat: '.2f',
                          showgrid: true,
                          gridcolor: '#F1F5F9',
                          showline: true,
                          mirror: false,
                          linecolor: '#000000',
                          linewidth: 1.5,
                          tickfont: { size: 11, color: '#475569' }
                        },
                        margin: { l: 60, r: 60, t: 40, b: 80 },
                        hovermode: 'closest' as any,
                        showlegend: true,
                        legend: {
                          font: { family: 'Inter, sans-serif', size: 10, color: '#475569' },
                          orientation: 'v' as any,
                          y: 0.5,
                          x: 1.05,
                          yanchor: 'middle' as any,
                          xanchor: 'left' as any
                        }
                      }}
                      config={{ responsive: true, displayModeBar: true }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                </Card>

                {/* Graph 2: DIAHOPANE INDEX vs C29H/C30H */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">DIAHOPANE INDEX vs C29H/C30H</h4>
                    </div>
                  </div>
                  <div className="p-5 w-full h-[550px]">
                    <Plot
                      data={renderDiaHTraces(hopaneData)}
                      layout={{
                        ...getCommonLayout(
                          '',
                          'Diahopane Index',
                          'C29H/C30H'
                        ),
                        xaxis: {
                          title: { text: '<b>Diahopane Index</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0, 1.0],
                          tickvals: [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
                          ticktext: ['0.00', '0.10', '0.20', '0.30', '0.40', '0.50', '0.60', '0.70', '0.80', '0.90', '1.00'],
                          gridcolor: '#F1F5F9',
                          zeroline: false,
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        yaxis: {
                          title: { text: '<b>C29H/C30H</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0, 1.0],
                          tickvals: [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
                          ticktext: ['0.00', '0.10', '0.20', '0.30', '0.40', '0.50', '0.60', '0.70', '0.80', '0.90', '1.00'],
                          gridcolor: '#F1F5F9',
                          zeroline: false,
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
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
                  </div>
                </Card>

                {/* Graph 3: C35S/C34S vs C29H/C30H */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">C35S/C34S vs C29H/C30H</h4>
                    </div>
                  </div>
                  <div className="p-5 w-full h-[550px]">
                    <Plot
                      data={render3534HHTraces(hopaneData)}
                      layout={{
                        ...getCommonLayout(
                          '',
                          'C29H/C30H',
                          'Homohopane (C35S/C34S)'
                        ),
                        xaxis: {
                          title: { text: '<b>C29H/C30H</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0, 1.0],
                          tickvals: [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
                          ticktext: ['0.00', '0.10', '0.20', '0.30', '0.40', '0.50', '0.60', '0.70', '0.80', '0.90', '1.00'],
                          gridcolor: '#F1F5F9',
                          zeroline: false,
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        yaxis: {
                          title: { text: '<b>Homohopane (C35S/C34S)</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0, 1.2],
                          tickvals: [0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2],
                          ticktext: ['0.00', '0.20', '0.40', '0.60', '0.80', '1.00', '1.20'],
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
                            x0: 0.60,
                            x1: 0.60,
                            y0: 0,
                            y1: 1.20,
                            line: { color: '#000000', width: 1.0, dash: 'dash' }
                          },
                          {
                            type: 'line',
                            x0: 0.00,
                            x1: 1.00,
                            y0: 0.80,
                            y1: 0.80,
                            line: { color: '#000000', width: 1.0, dash: 'dash' }
                          }
                        ],
                        annotations: [
                          {
                            x: 0.82,
                            y: 1.12,
                            xref: 'x',
                            yref: 'y',
                            text: 'Marine Carbonate',
                            showarrow: false,
                            font: { size: 11, color: '#000000', family: 'Inter, sans-serif' }
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
                  </div>
                </Card>

                {/* Graph 4: OLEANANE INDEX & BCD INDEX */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">OLEANANE INDEX & BCD INDEX</h4>
                    </div>
                  </div>
                  <div className="p-5 w-full h-[550px]">
                    <Plot
                      data={renderOleananeBCDTraces(hopaneData)}
                      layout={{
                        ...getCommonLayout(
                          '',
                          '',
                          'Index Value'
                        ),
                        barmode: 'group',
                        xaxis: {
                          tickfont: { size: 11, color: '#475569' },
                          gridcolor: '#F1F5F9',
                          zeroline: false,
                          showline: true,
                          mirror: true,
                          linecolor: '#000000',
                          linewidth: 2
                        },
                        yaxis: {
                          title: { text: '<b>Index Value</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                          range: [0, 0.7],
                          tickvals: [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
                          ticktext: ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7'],
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
                            x0: -0.5,
                            x1: Array.from(new Set(hopaneData.map(h => h.name || 'Unknown'))).length - 0.5,
                            y0: 0.40,
                            y1: 0.40,
                            line: { color: '#888888', width: 1.0 }
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
                  </div>
                </Card>

                {/* Graph 5: C29H/C30H vs C29 DIASTERANE INDEX */}
                <Card className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl bg-white" noPadding>
                  <div className="border-b border-slate-100 p-5 pb-3">
                    <div className="inline-block border border-slate-200/80 px-3 py-1 rounded-lg bg-slate-50/50 shadow-2xs">
                      <h4 className="text-sm font-bold text-slate-800">C29H/C30H vs C29 DIASTERANE INDEX</h4>
                    </div>
                  </div>
                  <div className="p-5 w-full h-[550px]">
                    {steraneDataLoading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Spinner size="lg" />
                      </div>
                    ) : (
                      <Plot
                        data={render29HDiasteraneTraces(hopaneData || [], steraneData || [])}
                        layout={{
                          ...getCommonLayout(
                            '',
                            'C29H/C30H',
                            'Diasterane Index'
                          ),
                          xaxis: {
                            title: { text: '<b>C<sub>29</sub>H/C<sub>30</sub>H</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                            range: [0, 3.0],
                            tickvals: [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0],
                            ticktext: ['0.00', '0.50', '1.00', '1.50', '2.00', '2.50', '3.00'],
                            gridcolor: '#F1F5F9',
                            zeroline: false,
                            showline: true,
                            mirror: true,
                            linecolor: '#000000',
                            linewidth: 2
                          },
                          yaxis: {
                            title: { text: '<b>Diasterane Index</b>', font: { family: 'Inter, sans-serif', size: 12, color: '#475569' } },
                            range: [0, 5.0],
                            tickvals: [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0],
                            ticktext: ['0.00', '0.50', '1.00', '1.50', '2.00', '2.50', '3.00', '3.50', '4.00', '4.50', '5.00'],
                            gridcolor: '#F1F5F9',
                            zeroline: false,
                            showline: true,
                            mirror: true,
                            linecolor: '#000000',
                            linewidth: 2
                          },
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

                <DashboardDatasetTable
                  title="Hopane Biomarker Dataset Records"
                  data={hopaneData}
                  variables={hopaneDataset?.variables}
                  isLoading={hopaneDataLoading}
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
  
  export default HopaneDashboard;
