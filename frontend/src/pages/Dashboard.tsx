import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Database, Layers, Filter, RefreshCw, BarChart2, CheckSquare, Square, Search, Sliders, FileText, Download, Flame, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '../components/common/Card';
import { KpiCard } from '../components/common/KpiCard';
import { Spinner } from '../components/common/Spinner';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { formatNumber } from '../utils/formatters';
import { DynamicPlotlyChart } from '../components/charts/DynamicPlotlyChart';
import api from '../services/api';
import { DashboardDatasetTable } from '../components/common/DashboardDatasetTable';

const computeS2TocStats = (points: any[]) => {
  let total = 0;
  let sumToc = 0;
  let sumS2 = 0;
  
  const tocCounts = { poor: 0, fair: 0, good: 0, veryGood: 0, excellent: 0 };
  const s2Counts = { poor: 0, fair: 0, good: 0, veryGood: 0, excellent: 0 };

  points.forEach(pt => {
    const x = parseFloat(pt.x);
    const y = parseFloat(pt.y);
    if (!isNaN(x) && !isNaN(y)) {
      total++;
      sumToc += x;
      sumS2 += y;

      // TOC Classification
      if (x < 0.5) tocCounts.poor++;
      else if (x < 1.0) tocCounts.fair++;
      else if (x < 2.0) tocCounts.good++;
      else if (x < 4.0) tocCounts.veryGood++;
      else tocCounts.excellent++;

      // S2 Classification
      if (y < 2.5) s2Counts.poor++;
      else if (y < 5.0) s2Counts.fair++;
      else if (y < 10.0) s2Counts.good++;
      else if (y < 20.0) s2Counts.veryGood++;
      else s2Counts.excellent++;
    }
  });

  return {
    total,
    avgToc: total > 0 ? (sumToc / total) : 0,
    avgS2: total > 0 ? (sumS2 / total) : 0,
    tocCounts,
    s2Counts
  };
};

const computeHiTmaxStats = (points: any[]) => {
  let total = 0;
  let sumHi = 0;
  let sumTmax = 0;
  let minHi = Infinity;
  let maxHi = -Infinity;
  let minTmax = Infinity;
  let maxTmax = -Infinity;

  points.forEach(pt => {
    const x = parseFloat(pt.x); // Tmax
    const y = parseFloat(pt.y); // HI
    if (!isNaN(x) && !isNaN(y)) {
      total++;
      sumHi += y;
      sumTmax += x;
      if (y < minHi) minHi = y;
      if (y > maxHi) maxHi = y;
      if (x < minTmax) minTmax = x;
      if (x > maxTmax) maxTmax = x;
    }
  });

  return {
    total,
    avgHi: total > 0 ? (sumHi / total) : 0,
    avgTmax: total > 0 ? (sumTmax / total) : 0,
    minHi: total > 0 ? minHi : 0,
    maxHi: total > 0 ? maxHi : 0,
    minTmax: total > 0 ? minTmax : 0,
    maxTmax: total > 0 ? maxTmax : 0
  };
};


interface VariableDef {
  id: number;
  name: string;
  display_name: string;
  sql_column_name: string;
  is_numeric: boolean;
  is_visible: boolean;
  is_filterable: boolean;
  chart_enabled: boolean;
  kpi_enabled: boolean;
  display_unit: string | null;
  synonyms?: string[];
}

interface DatasetDef {
  id: number;
  name: string;
  display_name: string;
  sql_table_name: string | null;
  module: string;
  primary_depth_column: string | null;
  primary_well_column: string | null;
  variables: VariableDef[];
}

export const Dashboard: React.FC = () => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);
  const [s2TocColorBy, setS2TocColorBy] = useState<'well' | 'formation'>('well');
  const [hiTmaxColorBy, setHiTmaxColorBy] = useState<'well' | 'formation'>('well');
  const [collapsedStats, setCollapsedStats] = useState<Record<string, boolean>>({
    s2_vs_toc: true,
    hi_vs_tmax: true,
  });

  const toggleStats = (chartId: string) => {
    setCollapsedStats((prev) => ({
      ...prev,
      [chartId]: !prev[chartId],
    }));
  };

  // Ad-hoc interactive chart builder state
  const [showCustomBuilder, setShowCustomBuilder] = useState<boolean>(false);
  const [xVar, setXVar] = useState<string>('');
  const [yVar, setYVar] = useState<string>('');
  const [zVar, setZVar] = useState<string>('');
  const [colorBy, setColorBy] = useState<string>('');
  const [chartType, setChartType] = useState<string>('scatter');

  // Client-side state for categorical filter option search queries
  const [filterSearches, setFilterSearches] = useState<Record<string, string>>({});
  // Track checked array values for categorical filters
  const [multiFilters, setMultiFilters] = useState<Record<string, string[]>>({});

  // 1. Fetch Registered Datasets
  const { data: datasets, isLoading: datasetsLoading, refetch: refetchDatasets } = useQuery<DatasetDef[]>({
    queryKey: ['datasets'],
    queryFn: () => api.get<DatasetDef[]>('/datasets').then((res) => res.data),
  });

  const activeDataset = datasets?.find((d) => d.id === selectedDatasetId);

  const [searchParams, setSearchParams] = useSearchParams();
  const paramDataset = searchParams.get('dataset');

  const sourceRockDatasets = React.useMemo(() => {
    if (!datasets || datasets.length === 0) return [];
    
    // Priority: explicitly match the configured source rock datasets
    const exactSourceRock = datasets.filter((d) => 
      ['core_source_rock', 'cutting_source_rock', 'core_sourcerock_kdmipe', 'cutting_sourcerock_kdmipe', 'swc_sourcerock', 'swc_sourcerock_kdmipe'].includes(d.name.toLowerCase()) ||
      (d.module === 'geochemistry' && (d.sql_table_name?.toUpperCase().includes('SOURCEROCK') || d.sql_table_name?.toUpperCase().includes('SOURCE_ROCK')))
    );
    
    if (exactSourceRock.length > 0) {
      return exactSourceRock;
    }

    return datasets.filter((d) => 
      d.module === 'geochemistry' && 
      !d.name.startsWith('w_') &&
      d.name !== 'petroleum_geochem' && 
      d.name !== 'combined' &&
      !d.name.toLowerCase().includes('vro') &&
      !d.name.toLowerCase().includes('vitrinite') &&
      !d.name.toLowerCase().includes('kinetic') &&
      !d.display_name.toLowerCase().includes('vro') &&
      !d.display_name.toLowerCase().includes('vitrinite') &&
      !d.display_name.toLowerCase().includes('kinetic')
    );
  }, [datasets]);

  // Sync selectedDatasetId from URL param
  useEffect(() => {
    if (!sourceRockDatasets || sourceRockDatasets.length === 0) return;
    
    let matched = null;
    if (paramDataset) {
      const match = paramDataset.toLowerCase();
      if (match === 'core') {
        matched = sourceRockDatasets.find(d => d.name === 'core_source_rock' || d.name === 'core_sourcerock_kdmipe')
               || sourceRockDatasets.find(d => d.name.toLowerCase().includes('core_source') || d.display_name.toLowerCase().includes('core source'))
               || sourceRockDatasets.find(d => d.name.toLowerCase().includes('core') || d.display_name.toLowerCase().includes('core'));
      } else if (match === 'cutting') {
        matched = sourceRockDatasets.find(d => d.name === 'cutting_source_rock' || d.name === 'cutting_sourcerock_kdmipe')
               || sourceRockDatasets.find(d => d.name.toLowerCase().includes('cutting_source') || d.display_name.toLowerCase().includes('cutting source'))
               || sourceRockDatasets.find(d => d.name.toLowerCase().includes('cutting') || d.display_name.toLowerCase().includes('cutting'));
      } else if (match === 'kinetics') {
        matched = sourceRockDatasets.find(d => d.name.toLowerCase().includes('kinetic') || d.display_name.toLowerCase().includes('kinetic'));
      } else if (match === 'vro') {
        matched = sourceRockDatasets.find(d => d.name.toLowerCase().includes('vro') || d.display_name.toLowerCase().includes('vro') || d.name.toLowerCase().includes('vitrinite'));
      }
    }

    if (matched) {
      if (selectedDatasetId !== matched.id) {
        setSelectedDatasetId(matched.id);
      }
    } else {
      // If no valid param, default to core or cutting if available, otherwise first
      const defaultDs = sourceRockDatasets.find(d => d.name === 'core_source_rock' || d.name === 'cutting_source_rock') || sourceRockDatasets[0];
      const isStillPresent = sourceRockDatasets.some((d) => d.id === selectedDatasetId);
      if (selectedDatasetId === null || !isStillPresent) {
        setSelectedDatasetId(defaultDs.id);
      }
    }
  }, [sourceRockDatasets, paramDataset]);

  // Sync URL param from selectedDatasetId
  useEffect(() => {
    if (!activeDataset) return;
    const name = (activeDataset.name + ' ' + activeDataset.display_name).toLowerCase();
    let key = '';
    if (name.includes('core')) key = 'core';
    else if (name.includes('cutting')) key = 'cutting';
    else if (name.includes('kinetic')) key = 'kinetics';
    else if (name.includes('vro') || name.includes('vitrinite')) key = 'vro';

    if (key && searchParams.get('dataset') !== key) {
      setSearchParams({ dataset: key }, { replace: true });
    }
  }, [selectedDatasetId, activeDataset]);

  const getSelectedCard = () => {
    if (!activeDataset) return '';
    const name = (activeDataset.name + ' ' + activeDataset.display_name).toLowerCase();
    if (name.includes('core')) return 'core';
    if (name.includes('cutting')) return 'cutting';
    if (name.includes('kinetic')) return 'kinetics';
    if (name.includes('vro') || name.includes('vitrinite')) return 'vro';
    return '';
  };

  const handleCardClick = (cardKey: 'core' | 'cutting' | 'kinetics' | 'vro') => {
    if (!sourceRockDatasets || sourceRockDatasets.length === 0) return;
    let matched = null;
    if (cardKey === 'core') {
      matched = sourceRockDatasets.find(d => d.name === 'core_source_rock' || d.name === 'core_sourcerock_kdmipe')
             || sourceRockDatasets.find(d => d.name.toLowerCase().includes('core_source') || d.display_name.toLowerCase().includes('core source'))
             || sourceRockDatasets.find(d => d.name.toLowerCase().includes('core') || d.display_name.toLowerCase().includes('core'));
    } else if (cardKey === 'cutting') {
      matched = sourceRockDatasets.find(d => d.name === 'cutting_source_rock' || d.name === 'cutting_sourcerock_kdmipe')
             || sourceRockDatasets.find(d => d.name.toLowerCase().includes('cutting_source') || d.display_name.toLowerCase().includes('cutting source'))
             || sourceRockDatasets.find(d => d.name.toLowerCase().includes('cutting') || d.display_name.toLowerCase().includes('cutting'));
    } else if (cardKey === 'kinetics') {
      matched = sourceRockDatasets.find(d => d.name.toLowerCase().includes('kinetic') || d.display_name.toLowerCase().includes('kinetic'));
    } else if (cardKey === 'vro') {
      matched = sourceRockDatasets.find(d => d.name.toLowerCase().includes('vro') || d.display_name.toLowerCase().includes('vro') || d.name.toLowerCase().includes('vitrinite'));
    }
    if (matched) {
      setSelectedDatasetId(matched.id);
    }
  };



  // Set default chart variables & reset filters when dataset changes
  useEffect(() => {
    if (activeDataset && activeDataset.variables.length > 0) {
      const numericVars = activeDataset.variables.filter((v) => v.is_numeric && v.sql_column_name.toLowerCase() !== 'id');
      const categoricalVars = activeDataset.variables.filter((v) => !v.is_numeric);
      
      // Auto-Recommendation Engine:
      // Case 1: Subsurface Depth logs -> Recommended Depth Profile
      const hasDepth = activeDataset.variables.some(
        v => v.sql_column_name.toLowerCase().includes('depth') || v.sql_column_name.toLowerCase() === 'md'
      );
      const depthCol = activeDataset.variables.find(
        v => v.sql_column_name.toLowerCase().includes('depth') || v.sql_column_name.toLowerCase() === 'md'
      )?.sql_column_name || '';

      if (hasDepth && numericVars.length > 1) {
        const otherNumeric = numericVars.find(v => v.sql_column_name !== depthCol)?.sql_column_name || numericVars[0].sql_column_name;
        setXVar(otherNumeric);
        setYVar(depthCol);
        setChartType('depth_profile');
      }
      // Case 2: Correlation heatmap -> if more than 3 numeric columns
      else if (numericVars.length >= 4) {
        setXVar(numericVars[0].sql_column_name);
        setYVar('');
        setChartType('correlation_matrix');
      }
      // Case 3: Categorical distributions -> if a numeric variable and categorical exist
      else if (numericVars.length >= 1 && categoricalVars.length >= 1) {
        setXVar(categoricalVars[0].sql_column_name);
        setYVar(numericVars[0].sql_column_name);
        setChartType('bar');
      }
      // Case 4: General scatter
      else if (numericVars.length >= 2) {
        setXVar(numericVars[0].sql_column_name);
        setYVar(numericVars[1].sql_column_name);
        setChartType('scatter');
      }
      // Default fallback
      else {
        setXVar(activeDataset.variables[0].sql_column_name);
        setYVar('');
        setChartType('histogram');
      }

      if (categoricalVars.length > 0) {
        setColorBy(categoricalVars[0].sql_column_name);
      } else {
        setColorBy('');
      }
      setZVar('');

      // Reset all dynamic filters state
      setFilters({});
      setFilterSearches({});
      setMultiFilters({});
    }
  }, [selectedDatasetId, activeDataset]);

  // 2. Fetch Dynamic Metadata filter distinct options and ranges
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

  // 3. Fetch Dynamic Summary KPIs
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats-dynamic', selectedDatasetId, filters],
    queryFn: () =>
      api.get('/dashboard', {
        params: {
          dataset_id: selectedDatasetId,
          ...filters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  // 3.5 Fetch All Filtered Records for Scientific Dashboard
  const { data: scientificData, isLoading: scientificLoading, refetch: refetchScientific } = useQuery<any[]>({
    queryKey: ['scientific-plots-data', selectedDatasetId, filters],
    queryFn: () =>
      api.get<any[]>('/dashboard/scientific-plots', {
        params: {
          dataset_id: selectedDatasetId,
          ...filters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  const rolesMap = {
    toc: ['toc', 'total organic carbon', 'total carbon', 'total organic carbon (toc)'],
    s1: ['s1', 'free hydrocarbons', 's1 (mg hc/g rock)'],
    s2: ['s2', 'pyrolyzable hydrocarbons', 'hydrocarbon yield', 's2 (mg hc/g rock)'],
    s3: ['s3', 's3 (mg co2/g rock)'],
    hi: ['hi', 'hydrogen index', 'hydrogen_index', 'hydrogen index (hi)'],
    oi: ['oi', 'oxygen index', 'oxygen_index', 'oxygen index (oi)'],
    pi: ['pi', 'production index', 'production_index', 'production index (pi)'],
    tmax: ['tmax', 't_max', 'max temperature', 'tmax (c)', 'tmax (°c)'],
    vro: ['vro', 'vitrinite reflectance', 'ro', 'average vro', 'mean vro', 'vro (%)', 'average_vro'],
    osi: ['osi', 'oil saturation index', 'oil_saturation_index'],
    depth: ['depth', 'md', 'tvd', 'top depth', 'sample top', 'depth (m)'],
    well: ['well', 'well name', 'borehole', 'borehole name', 'well_name'],
    lithology: ['lithology', 'lith', 'lithology type', 'sample type', 'lithology_type'],
    formation: ['formation', 'fm', 'stratigraphy'],
    // Kinetics
    ea: ['ea', 'activation energy', 'activation_energy'],
    freq: ['frequency factor', 'freq_factor', 'ln a', 'ln(a)', 'ln_a', 'a', 'frequency_factor'],
    tr: ['transformation ratio', 'tr', 'transformation_ratio'],
    reaction: ['reaction progress', 'reaction_progress', 'progress'],
    temperature: ['temperature', 'temp']
  };

  const findColByRole = (role: string): string | null => {
    if (!activeDataset) return null;
    const r = role.toLowerCase();
    const synonyms = (rolesMap as any)[r] || [r];

    // 1. Direct synonym/role match
    const matched = activeDataset.variables.find((v) => {
      const vName = v.name.toLowerCase();
      const vSql = v.sql_column_name.toLowerCase();
      const vDisp = v.display_name.toLowerCase();
      const vSyns = (v as any).synonyms || [];

      return (
        synonyms.includes(vName) ||
        synonyms.includes(vSql) ||
        synonyms.includes(vDisp) ||
        vSyns.some((s: string) => synonyms.includes(s.toLowerCase()))
      );
    });

    if (matched) return matched.sql_column_name;

    // 2. Substring fallback match
    const fallback = activeDataset.variables.find((v) =>
      synonyms.some((syn) =>
        v.sql_column_name.toLowerCase().includes(syn) ||
        v.display_name.toLowerCase().includes(syn)
      )
    );

    return fallback ? fallback.sql_column_name : null;
  };

  const calculateCorrelationMatrix = (data: any[], numericCols: string[]) => {
    const n = data.length;
    if (n < 2 || numericCols.length === 0) {
      return { labels: [], z: [] };
    }
    
    // Extract values
    const colsData = numericCols.map(col => {
      return data.map(row => {
        const v = parseFloat(row[col]);
        return isNaN(v) ? 0 : v;
      });
    });
    
    const matrix: number[][] = [];
    for (let i = 0; i < numericCols.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < numericCols.length; j++) {
        matrix[i][j] = getPearsonCorrelation(colsData[i], colsData[j]);
      }
    }
    
    return {
      labels: numericCols.map(c => {
        const v = activeDataset?.variables.find(x => x.sql_column_name === c);
        return v ? v.display_name : c;
      }),
      z: matrix
    };
  };

  const getPearsonCorrelation = (x: number[], y: number[]): number => {
    const n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0;
    let sumX2 = 0, sumY2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }
    
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    if (den === 0) return 0;
    return num / den;
  };

  const _dummy_generateScientificCharts = (variables: VariableDef[], data: any[]) => {
    if (!data || data.length === 0) return [];

    const charts: any[] = [];

    const tocCol = findColByRole('toc');
    const s2Col = findColByRole('s2');

    if (tocCol && s2Col) {
      const s2TocPoints = data
        .map((pt) => {
          const xVal = pt[tocCol];
          const yVal = pt[s2Col];
          
          if (xVal === undefined || xVal === null || isNaN(parseFloat(xVal)) ||
              yVal === undefined || yVal === null || isNaN(parseFloat(yVal))) {
            return null;
          }

          const rawWell = pt.borehole_name || pt.well_name || pt.well || pt.ubhi || 'N/A';
          const wellName = rawWell.startsWith('TMP_WELL_') ? 'N/A' : rawWell;
          const formation = pt.layer_name || pt.formation || pt.fm || 'N/A';

          return {
            x: parseFloat(xVal),
            y: parseFloat(yVal),
            chart_id: 's2_vs_toc',
            well_name: wellName,
            sample_id: pt.cuttings_sample_id || pt.core_sample_id || pt.sample_id || pt.sample || pt.id || 'N/A',
            color_by: s2TocColorBy === 'formation' ? formation : (wellName !== 'N/A' ? wellName : 'Samples'),
            formation: formation,
            top_depth: pt.top_depth !== undefined && pt.top_depth !== null ? pt.top_depth : (pt.sample_top !== undefined && pt.sample_top !== null ? pt.sample_top : (pt.depth !== undefined && pt.depth !== null ? pt.depth : 'N/A')),
            sample_type: pt.lithology || pt.sample_type || pt.type || 'N/A'
          };
        })
        .filter((p) => p !== null && p.x > 0 && p.y > 0);

      charts.push({
        id: 's2_vs_toc',
        chartType: 's2_vs_toc',
        category: 'Crossplots',
        title: 'S2 vs TOC Petroleum Geochemistry Interpretation',
        xLabel: 'TOC (% wt.)',
        yLabel: 'Hydrocarbon Generation Potential: S2 (mg HC/g rock)',
        colorByLabel: s2TocColorBy === 'formation' ? 'Formation' : 'Well Name',
        data: s2TocPoints
      });
    }

    const hiCol = findColByRole('hi');
    const tmaxCol = findColByRole('tmax');

    if (hiCol && tmaxCol) {
      const hiTmaxPoints = data
        .map((pt) => {
          const xVal = pt[tmaxCol];
          const yVal = pt[hiCol];
          
          if (xVal === undefined || xVal === null || isNaN(parseFloat(xVal)) ||
              yVal === undefined || yVal === null || isNaN(parseFloat(yVal))) {
            return null;
          }

          const rawWell = pt.borehole_name || pt.well_name || pt.well || pt.ubhi || 'N/A';
          const wellName = rawWell.startsWith('TMP_WELL_') ? 'N/A' : rawWell;
          const formation = pt.layer_name || pt.formation || pt.fm || 'N/A';
          const sampleType = pt.lithology || pt.sample_type || pt.type || 'N/A';

          return {
            ...pt, // Retain complete source row metadata
            x: parseFloat(xVal),
            y: parseFloat(yVal),
            chart_id: 'hi_vs_tmax',
            well_name: wellName,
            sample_id: pt.cuttings_sample_id || pt.core_sample_id || pt.sample_id || pt.sample || pt.id || 'N/A',
            color_by: hiTmaxColorBy === 'formation' ? formation : (wellName !== 'N/A' ? wellName : 'Samples'),
            formation: formation,
            top_depth: pt.top_depth !== undefined && pt.top_depth !== null ? pt.top_depth : (pt.sample_top !== undefined && pt.sample_top !== null ? pt.sample_top : (pt.depth !== undefined && pt.depth !== null ? pt.depth : 'N/A')),
            sample_type: sampleType
          };
        })
        .filter((p) => p !== null && p.x > 0 && p.y > 0);

      charts.push({
        id: 'hi_vs_tmax',
        chartType: 'hi_vs_tmax',
        category: 'Crossplots',
        title: 'HI vs Tmax Plot',
        xLabel: 'Tmax (oC)',
        yLabel: 'Hydrogen Index : HI (mg HC/gm TOC)',
        colorByLabel: hiTmaxColorBy === 'formation' ? 'Formation' : 'Well Name',
        data: hiTmaxPoints
      });
    }

    return charts;
  };
  const generateScientificCharts = (variables: VariableDef[], data: any[]) => {
    if (!data || data.length === 0) return [];

    const charts: any[] = [];

    const tocCol = findColByRole('toc');
    const s1Col = findColByRole('s1');
    const s2Col = findColByRole('s2');
    const s3Col = findColByRole('s3');
    const hiCol = findColByRole('hi');
    const oiCol = findColByRole('oi');
    const piCol = findColByRole('pi');
    const tmaxCol = findColByRole('tmax');
    const vroCol = findColByRole('vro');
    const osiCol = findColByRole('osi');
    const depthCol = activeDataset?.primary_depth_column || findColByRole('depth');
    const wellCol = activeDataset?.primary_well_column || findColByRole('well');
    const lithCol = findColByRole('lithology');
    const formationCol = findColByRole('formation');
    
    // Kinetics specific columns
    const eaCol = findColByRole('ea');
    const freqCol = findColByRole('freq');
    const trCol = findColByRole('tr');
    const reactionCol = findColByRole('reaction');
    const tempCol = findColByRole('temperature');

    const getPoints = (xCol: string, yCol: string | null, colorCol: string | null = null) => {
      return data
        .map(pt => {
          const xVal = pt[xCol];
          const yVal = yCol ? pt[yCol] : undefined;
          const colorVal = colorCol ? pt[colorCol] : undefined;
          
          if (xVal === undefined || xVal === null) return null;
          if (yCol && (yVal === undefined || yVal === null)) return null;

          return {
            x: xVal,
            y: yVal,
            color_by: colorVal !== undefined ? String(colorVal) : undefined
          };
        })
        .filter(p => p !== null) as any[];
    };

    const getS2TocPoints = (xCol: string, yCol: string) => {
      return data
        .map(pt => {
          const xVal = pt[xCol];
          const yVal = pt[yCol];
          
          if (xVal === undefined || xVal === null) return null;
          if (yVal === undefined || yVal === null) return null;

          const rawWell = pt['well_name'] || pt['well'] || pt['ubhi'] || 'N/A';
          const wellName = rawWell.startsWith('TMP_WELL_') ? 'N/A' : rawWell;

          return {
            x: xVal,
            y: yVal,
            well_name: wellName,
            sample_id: pt['sample_id'] || pt['sample'] || pt['core_sample_id'] || pt['cuttings_sample_id'] || pt['id'] || 'N/A',
            color_by: s2TocColorBy === 'formation' ? (pt['layer_name'] || pt['formation'] || pt['fm'] || 'N/A') : wellName,
            formation: pt['layer_name'] || pt['formation'] || pt['fm'] || 'N/A',
            layer: pt['layer'] || 'N/A',
            top_depth: pt['top_depth'] !== undefined && pt['top_depth'] !== null ? pt['top_depth'] : (pt['depth_from'] || pt['depth'] || 'N/A'),
            bottom_depth: pt['bottom_depth'] !== undefined && pt['bottom_depth'] !== null ? pt['bottom_depth'] : (pt['depth_to'] || pt['depth_max'] || 'N/A'),
            sample_type: pt['sample_type'] || pt['type'] || pt['lithology'] || 'N/A',
            dataset_name: pt['dataset_name'] || activeDataset?.display_name || 'N/A'
          };
        })
        .filter(p => p !== null) as any[];
    };

    const getHiTmaxPoints = (xCol: string, yCol: string) => {
      return data
        .map(pt => {
          const xVal = pt[xCol];
          const yVal = pt[yCol];
          
          if (xVal === undefined || xVal === null) return null;
          if (yVal === undefined || yVal === null) return null;

          const rawWell = pt['well_name'] || pt['well'] || pt['ubhi'] || 'N/A';
          const wellName = rawWell.startsWith('TMP_WELL_') ? 'N/A' : rawWell;

          return {
            x: xVal,
            y: yVal,
            well_name: wellName,
            sample_id: pt['sample_id'] || pt['sample'] || pt['core_sample_id'] || pt['cuttings_sample_id'] || pt['id'] || 'N/A',
            color_by: hiTmaxColorBy === 'formation' ? (pt['layer_name'] || pt['formation'] || pt['fm'] || 'N/A') : wellName,
            formation: pt['layer_name'] || pt['formation'] || pt['fm'] || 'N/A',
            layer: pt['layer'] || 'N/A',
            top_depth: pt['top_depth'] !== undefined && pt['top_depth'] !== null ? pt['top_depth'] : (pt['depth_from'] || pt['depth'] || 'N/A'),
            bottom_depth: pt['bottom_depth'] !== undefined && pt['bottom_depth'] !== null ? pt['bottom_depth'] : (pt['depth_to'] || pt['depth_max'] || 'N/A'),
            toc: pt['toc'] || pt['average_toc'] || 'N/A',
            s2: pt['s2'] || pt['average_s2'] || 'N/A',
            sample_type: pt['sample_type'] || pt['type'] || pt['lithology'] || 'N/A',
            dataset_name: pt['dataset_name'] || activeDataset?.display_name || 'N/A'
          };
        })
        .filter(p => p !== null) as any[];
    };

    const numericVars = variables.filter(v => v.is_numeric && v.sql_column_name.toLowerCase() !== 'id');
    const categoricalVars = variables.filter(v => !v.is_numeric);

    const getLabel = (colName: string) => {
      return variables.find(v => v.sql_column_name === colName)?.display_name || colName;
    };

    // Helper to register a chart
    const addChart = (cfg: {
      id: string;
      title: string;
      category: string;
      chartType: string;
      xCol: string;
      yCol: string | null;
      colorCol?: string | null;
    }) => {
      const pts = getPoints(cfg.xCol, cfg.yCol, cfg.colorCol);
      if (pts.length > 0) {
        charts.push({
          id: cfg.id,
          title: cfg.title,
          category: cfg.category,
          chartType: cfg.chartType,
          xLabel: getLabel(cfg.xCol),
          yLabel: cfg.yCol ? getLabel(cfg.yCol) : undefined,
          colorByLabel: cfg.colorCol ? getLabel(cfg.colorCol) : undefined,
          data: pts
        });
      }
    };

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY 1: Crossplots
    // ────────────────────────────────────────────────────────────────────────
    if (tocCol && s2Col) {
      const s2TocPts = getS2TocPoints(tocCol, s2Col);
      if (s2TocPts.length > 0) {
        charts.push({
          id: 's2_vs_toc',
          title: 'S2 vs TOC Petroleum Geochemistry Interpretation',
          category: 'Crossplots',
          chartType: 's2_vs_toc',
          xLabel: 'TOC (% wt.)',
          yLabel: 'Hydrocarbon Generation Potential: S2 (mgHC/gm rock)',
          colorByLabel: 'Well Name',
          data: s2TocPts
        });
      }
    }
    if (hiCol && tmaxCol) {
      const hiTmaxPts = getHiTmaxPoints(tmaxCol, hiCol);
      if (hiTmaxPts.length > 0) {
        charts.push({
          id: 'hi_vs_tmax',
          title: 'HI vs Tmax Plot',
          category: 'Crossplots',
          chartType: 'hi_vs_tmax',
          xLabel: 'Tmax (°C)',
          yLabel: 'Hydrogen Index (mg HC/g TOC)',
          colorByLabel: 'Well Name',
          data: hiTmaxPts
        });
      }
    }
    if (tocCol && hiCol) {
      addChart({ id: 'toc_vs_hi', title: 'HI vs TOC Crossplot', category: 'Crossplots', chartType: 'scatter', xCol: tocCol, yCol: hiCol, colorCol: lithCol || wellCol });
    }
    if (tocCol && oiCol) {
      addChart({ id: 'toc_vs_oi', title: 'OI vs TOC Crossplot', category: 'Crossplots', chartType: 'scatter', xCol: tocCol, yCol: oiCol, colorCol: lithCol || wellCol });
    }
    if (s2Col && tmaxCol) {
      addChart({ id: 's2_vs_tmax', title: 'S2 vs Tmax Crossplot', category: 'Crossplots', chartType: 'scatter', xCol: tmaxCol, yCol: s2Col, colorCol: lithCol || wellCol });
    }
    if (s1Col && s2Col) {
      addChart({ id: 's1_vs_s2', title: 'S1 vs S2 Hydrocarbon Potential', category: 'Crossplots', chartType: 'scatter', xCol: s2Col, yCol: s1Col, colorCol: lithCol || wellCol });
    }
    if (piCol && tocCol) {
      addChart({ id: 'pi_vs_toc', title: 'PI vs TOC Maturity Plot', category: 'Crossplots', chartType: 'scatter', xCol: tocCol, yCol: piCol, colorCol: lithCol || wellCol });
    }
    if (osiCol && tocCol) {
      addChart({ id: 'osi_vs_toc', title: 'OSI vs TOC Reservoir Quality', category: 'Crossplots', chartType: 'scatter', xCol: tocCol, yCol: osiCol, colorCol: lithCol || wellCol });
    }
    if (hiCol && oiCol) {
      addChart({ id: 'hi_vs_oi', title: 'HI vs OI Pseudo-Van Krevelen', category: 'Crossplots', chartType: 'scatter', xCol: oiCol, yCol: hiCol, colorCol: lithCol || wellCol });
    }
    if (tocCol && vroCol) {
      addChart({ id: 'toc_vs_vro', title: 'TOC vs VRo Thermal Maturity', category: 'Crossplots', chartType: 'scatter', xCol: vroCol, yCol: tocCol, colorCol: wellCol });
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY 2: Depth Profiles
    // ────────────────────────────────────────────────────────────────────────
    if (depthCol) {
      const depthProfileCandidates = [
        { col: tocCol, id: 'toc_depth', title: 'TOC Depth Profile' },
        { col: s2Col, id: 's2_depth', title: 'S2 Depth Profile' },
        { col: hiCol, id: 'hi_depth', title: 'HI Depth Profile' },
        { col: oiCol, id: 'oi_depth', title: 'OI Depth Profile' },
        { col: piCol, id: 'pi_depth', title: 'PI Depth Profile' },
        { col: vroCol, id: 'vro_depth', title: 'VRo Depth Profile' },
        { col: trCol, id: 'tr_depth', title: 'Transformation Ratio Depth Profile' },
        { col: reactionCol, id: 'reaction_depth', title: 'Reaction Progress Depth Profile' }
      ];

      let registeredProfileCount = 0;
      depthProfileCandidates.forEach(cand => {
        if (cand.col && cand.col !== depthCol) {
          addChart({ id: cand.id, title: cand.title, category: 'Depth Profiles', chartType: 'depth_profile', xCol: cand.col, yCol: depthCol, colorCol: wellCol });
          registeredProfileCount++;
        }
      });

      // Dynamic Fallback Depth Profile for future datasets
      if (registeredProfileCount === 0) {
        numericVars.forEach(v => {
          if (v.sql_column_name !== depthCol) {
            addChart({
              id: `depth_profile_${v.sql_column_name}`,
              title: `${v.display_name} Depth Profile`,
              category: 'Depth Profiles',
              chartType: 'depth_profile',
              xCol: v.sql_column_name,
              yCol: depthCol,
              colorCol: wellCol
            });
          }
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY 3: Distributions
    // ────────────────────────────────────────────────────────────────────────
    const keyDistVariables = [
      { col: tocCol, id: 'dist_toc', label: 'TOC' },
      { col: hiCol, id: 'dist_hi', label: 'HI' },
      { col: oiCol, id: 'dist_oi', label: 'OI' },
      { col: piCol, id: 'dist_pi', label: 'PI' },
      { col: tmaxCol, id: 'dist_tmax', label: 'Tmax' },
      { col: s1Col, id: 'dist_s1', label: 'S1' },
      { col: s2Col, id: 'dist_s2', label: 'S2' },
      { col: vroCol, id: 'dist_vro', label: 'VRo' }
    ];

    let registeredDistCount = 0;
    keyDistVariables.forEach(cand => {
      if (cand.col) {
        addChart({ id: cand.id, title: `${cand.label} Distribution`, category: 'Distributions', chartType: 'histogram', xCol: cand.col, yCol: null });
        registeredDistCount++;
      }
    });

    if (registeredDistCount === 0) {
      numericVars.slice(0, 3).forEach(v => {
        addChart({
          id: `dist_${v.sql_column_name}`,
          title: `${v.display_name} Distribution`,
          category: 'Distributions',
          chartType: 'histogram',
          xCol: v.sql_column_name,
          yCol: null
        });
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY 4: Correlation
    // ────────────────────────────────────────────────────────────────────────
    if (numericVars.length >= 3) {
      const colNames = numericVars.map(v => v.sql_column_name);
      const matrix = calculateCorrelationMatrix(data, colNames);
      if (matrix.labels.length > 0) {
        charts.push({
          id: 'correlation_heatmap',
          title: 'Geochemical Correlation Matrix Heatmap',
          category: 'Correlation',
          chartType: 'correlation_matrix',
          xLabel: '',
          data: matrix
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY 5: Kerogen
    // ────────────────────────────────────────────────────────────────────────
    if (hiCol && oiCol) {
      addChart({ id: 'kerogen_class_van_krevelen', title: 'Kerogen Classification (Van Krevelen)', category: 'Kerogen', chartType: 'scatter', xCol: oiCol, yCol: hiCol, colorCol: lithCol || wellCol });
    } else if (hiCol && tmaxCol) {
      addChart({ id: 'kerogen_class_tmax', title: 'Kerogen Type (HI vs Tmax)', category: 'Kerogen', chartType: 'scatter', xCol: tmaxCol, yCol: hiCol, colorCol: lithCol || wellCol });
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY 6: Rock-Eval
    // ────────────────────────────────────────────────────────────────────────
    const rockEvalCandidateCols = [s1Col, s2Col, s3Col, tmaxCol].filter(Boolean) as string[];
    if (rockEvalCandidateCols.length >= 2) {
      // Generate multiple boxplots inside Rock-Eval category
      rockEvalCandidateCols.forEach(col => {
        addChart({
          id: `rock_eval_box_${col}`,
          title: `${getLabel(col)} Parameters Distribution`,
          category: 'Rock-Eval',
          chartType: 'boxplot',
          xCol: lithCol || wellCol || 'id',
          yCol: col
        });
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY 7: Statistics
    // ────────────────────────────────────────────────────────────────────────
    if (vroCol && wellCol) {
      addChart({ id: 'vro_by_well', title: 'Average VRo by Well Location', category: 'Statistics', chartType: 'boxplot', xCol: wellCol, yCol: vroCol });
    }
    if (formationCol && (vroCol || tocCol)) {
      addChart({ id: 'fm_comparison', title: 'Formation Characterization Compare', category: 'Statistics', chartType: 'boxplot', xCol: formationCol, yCol: vroCol || tocCol });
    }
    if (wellCol && numericVars.length > 0) {
      addChart({ id: 'well_comparison', title: 'Well Param Comparison Summary', category: 'Statistics', chartType: 'boxplot', xCol: wellCol, yCol: numericVars[0].sql_column_name });
    }
    if (vroCol || tmaxCol) {
      addChart({ id: 'thermal_maturity_stats', title: 'Thermal Maturity Indicators Range', category: 'Statistics', chartType: 'boxplot', xCol: lithCol || 'id', yCol: vroCol || tmaxCol });
    }

    // Fallback dynamic grouped stats boxplot
    if (numericVars.length > 0 && categoricalVars.length > 0) {
      const mainNum = numericVars[0].sql_column_name;
      const mainCat = categoricalVars[0].sql_column_name;
      addChart({
        id: `stat_dist_${mainNum}_by_${mainCat}`,
        title: `Statistical Distribution: ${getLabel(mainNum)} by ${getLabel(mainCat)}`,
        category: 'Statistics',
        chartType: 'boxplot',
        xCol: mainCat,
        yCol: mainNum
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY 8: Kinetics
    // ────────────────────────────────────────────────────────────────────────
    if (eaCol) {
      addChart({ id: 'ea_curve', title: 'Activation Energy (Ea) Distribution Curve', category: 'Kinetics', chartType: 'bar', xCol: eaCol, yCol: null });
    }
    if (freqCol) {
      addChart({ id: 'freq_dist', title: 'Frequency Factor (Ln A) Range Distribution', category: 'Kinetics', chartType: 'histogram', xCol: freqCol, yCol: null });
    }
    if (trCol && (tempCol || depthCol)) {
      addChart({ id: 'tr_curve', title: 'Transformation Ratio Progression', category: 'Kinetics', chartType: 'scatter', xCol: tempCol || depthCol || 'id', yCol: trCol, colorCol: wellCol });
    }
    if (reactionCol && (tempCol || depthCol)) {
      addChart({ id: 'reaction_progress', title: 'Reaction Progress Profile', category: 'Kinetics', chartType: 'scatter', xCol: tempCol || depthCol || 'id', yCol: reactionCol, colorCol: wellCol });
    }
    if (eaCol && freqCol) {
      addChart({ id: 'kinetics_scatter', title: 'Kinetics Parameter Crossplot (Ea vs Ln A)', category: 'Kinetics', chartType: 'scatter', xCol: eaCol, yCol: freqCol, colorCol: wellCol });
    }
    if (tempCol && numericVars.length > 0) {
      const param = numericVars.find(v => v.sql_column_name !== tempCol)?.sql_column_name;
      if (param) {
        addChart({ id: 'temp_relationship', title: 'Temperature Relationship Analysis', category: 'Kinetics', chartType: 'scatter', xCol: tempCol, yCol: param, colorCol: wellCol });
      }
    }

    return charts;
  };

  // Synchronize dynamic activeCategory tab selection when active dataset changes
  const activeChartsForSync = React.useMemo(() => {
    if (!scientificData || !activeDataset) return [];
    return generateScientificCharts(activeDataset.variables || [], scientificData);
  }, [scientificData, activeDataset, s2TocColorBy, hiTmaxColorBy]);

  const availableCategories = React.useMemo(() => {
    return Array.from(new Set(activeChartsForSync.map((c) => c.category).filter(Boolean))) as string[];
  }, [activeChartsForSync]);

  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.includes(activeCategory)) {
      setActiveCategory(availableCategories[0]);
    }
  }, [availableCategories, activeCategory]);




  // 4. Fetch Active Plotly Chart Data
  const { data: chartData, isLoading: chartLoading, refetch: refetchChart } = useQuery({
    queryKey: [
      'chart-data-dynamic',
      selectedDatasetId,
      xVar,
      yVar,
      zVar,
      chartType,
      colorBy,
      filters,
    ],
    queryFn: () =>
      api.get('/dashboard/chart-data', {
        params: {
          dataset_id: selectedDatasetId,
          x_axis: xVar,
          y_axis: yVar || undefined,
          z_axis: zVar || undefined,
          chart_type: chartType,
          color_by: colorBy || undefined,
          ...filters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId && showCustomBuilder && (!!xVar || chartType === 'correlation_matrix'),
  });



  const handleResetFilters = () => {
    setFilters({});
    setFilterSearches({});
    setMultiFilters({});
  };

  const handleRefreshAll = () => {
    refetchStats();
    refetchChart();
    refetchScientific();
  };

  const toggleMultiSelect = (colName: string, option: string) => {
    setMultiFilters((prev) => {
      const currentList = prev[colName] || [];
      const newList = currentList.includes(option)
        ? currentList.filter((x) => x !== option)
        : [...currentList, option];

      setFilters((f) => {
        const nextFilters = { ...f };
        if (newList.length > 0) {
          nextFilters[colName] = newList.join(',');
        } else {
          delete nextFilters[colName];
        }
        return nextFilters;
      });

      return { ...prev, [colName]: newList };
    });
  };

  if (datasetsLoading || (selectedDatasetId && statsLoading && metaLoading)) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const numericKpis = activeDataset?.variables?.filter((v) => v.kpi_enabled && v.is_numeric) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Datasets</h2>
        <Button
          variant="outline"
          size="sm"
          className="py-1 px-2.5 text-xs text-slate-500 hover:text-slate-700 bg-white"
          onClick={handleRefreshAll}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Refresh Data
        </Button>
      </div>


      {/* ── Dashboard KPIs ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Samples KPI */}
        <KpiCard
          title="Total Samples"
          value={stats?.total_samples || 0}
          description="Ingested records"
          accentColorClass="border-l-ongc-blue"
        />

        {/* Wells KPI */}
        <KpiCard
          title="Total Wells"
          value={stats?.total_wells || 0}
          description="Unique boreholes"
          accentColorClass="border-l-amber-500"
        />

        {/* Avg TOC KPI */}
        {(() => {
          const kpi = stats?.kpis?.find((k: any) => k.name.toLowerCase() === 'toc');
          if (!kpi) return null;
          return (
            <KpiCard
              title="Avg TOC"
              value={<>{formatNumber(kpi.avg || 0)} <span className="text-[10px] font-normal text-slate-500">{kpi.display_unit || 'wt%'}</span></>}
              description={`Range: ${formatNumber(kpi.min || 0)} - ${formatNumber(kpi.max || 0)}`}
              accentColorClass="border-l-emerald-500"
            />
          );
        })()}

        {/* Avg HI KPI */}
        {(() => {
          const kpi = stats?.kpis?.find((k: any) => k.name.toLowerCase() === 'hi');
          if (!kpi) return null;
          return (
            <KpiCard
              title="Avg HI"
              value={<>{formatNumber(kpi.avg || 0)} <span className="text-[10px] font-normal text-slate-500">{kpi.display_unit || 'mg/g'}</span></>}
              description={`Range: ${formatNumber(kpi.min || 0)} - ${formatNumber(kpi.max || 0)}`}
              accentColorClass="border-l-purple-500"
            />
          );
        })()}

        {/* Avg Tmax KPI */}
        {(() => {
          const kpi = stats?.kpis?.find((k: any) => k.name.toLowerCase() === 'tmax');
          if (!kpi) return null;
          return (
            <KpiCard
              title="Avg Tmax"
              value={<>{formatNumber(kpi.avg || 0)} <span className="text-[10px] font-normal text-slate-500">{kpi.display_unit || '°C'}</span></>}
              description={`Range: ${formatNumber(kpi.min || 0)} - ${formatNumber(kpi.max || 0)}`}
              accentColorClass="border-l-rose-500"
            />
          );
        })()}

        {/* Avg VRo KPI */}
        {(() => {
          const kpi = stats?.kpis?.find((k: any) => k.name.toLowerCase() === 'vro' || k.name.toLowerCase() === 'average_vro');
          if (!kpi) return null;
          return (
            <KpiCard
              title="Avg VRo"
              value={<>{formatNumber(kpi.avg || 0)} <span className="text-[10px] font-normal text-slate-500">{kpi.display_unit || '%'}</span></>}
              description={`Range: ${formatNumber(kpi.min || 0)} - ${formatNumber(kpi.max || 0)}`}
              accentColorClass="border-l-indigo-500"
            />
          );
        })()}
      </div>

      {/* ── Collapsible Filters Card ── */}
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
            {/* Generate dynamic numeric filters */}
            {activeDataset?.variables
              ?.filter((v) => v.is_filterable && v.is_numeric)
              ?.map((v) => {
                const range = metadata?.filter_ranges?.[v.sql_column_name] || { min: 0, max: 100 };
                const minKey = `${v.sql_column_name}_min`;
                const maxKey = `${v.sql_column_name}_max`;
                return (
                  <div key={v.sql_column_name} className="space-y-1.5 p-2.5 bg-white border border-slate-100 rounded-xl shadow-3xs">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                      {v.display_name} {v.display_unit ? `(${v.display_unit})` : ''}
                    </label>
                    <div className="flex gap-2">
                      <div className="w-1/2">
                        <label className="text-[9px] text-slate-400 block">Min Bound</label>
                        <input
                          type="number"
                          placeholder={range.min.toString()}
                          value={filters[minKey] || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFilters((prev) => {
                              const next = { ...prev };
                              if (val) next[minKey] = val;
                              else delete next[minKey];
                              return next;
                            });
                          }}
                          className="w-full text-xs rounded-lg border-slate-250 bg-slate-50/50 py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                        />
                      </div>
                      <div className="w-1/2">
                        <label className="text-[9px] text-slate-400 block">Max Bound</label>
                        <input
                          type="number"
                          placeholder={range.max.toString()}
                          value={filters[maxKey] || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFilters((prev) => {
                              const next = { ...prev };
                              if (val) next[maxKey] = val;
                              else delete next[maxKey];
                              return next;
                            });
                          }}
                          className="w-full text-xs rounded-lg border-slate-250 bg-slate-50/50 py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* Generate dynamic categorical filters */}
            {activeDataset?.variables
              ?.filter((v) => v.is_filterable && !v.is_numeric)
              ?.map((v) => {
                const options = metadata?.filter_options?.[v.sql_column_name] || [];
                const searchKey = v.sql_column_name;
                const searchVal = filterSearches[searchKey] || '';
                const checkedOpts = multiFilters[searchKey] || [];

                const filteredOpts = options.filter((opt) =>
                  opt.toLowerCase().includes(searchVal.toLowerCase())
                );

                return (
                  <div key={v.sql_column_name} className="space-y-1.5 p-2.5 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                      {v.display_name}
                    </label>
                    {options.length > 5 && (
                      <div className="relative">
                        <input
                          type="text"
                          placeholder={`Search...`}
                          value={searchVal}
                          onChange={(e) =>
                            setFilterSearches((prev) => ({ ...prev, [searchKey]: e.target.value }))
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
                              onClick={() => toggleMultiSelect(searchKey, opt)}
                              className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 hover:text-slate-800"
                            >
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-ongc-blue shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )}{' '}
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
        )}
      </Card>

      {/* Main Core Layout: Dynamic Data visualizer */}
      <div className="space-y-6">
        
        {/* Dataset Records Table (Default Collapsed at Top) */}
        <DashboardDatasetTable
          title={`${activeDataset?.display_name || 'Source Rock'} Dataset Records`}
          data={scientificData}
          variables={activeDataset?.variables}
          isLoading={scientificLoading}
        />

        {/* Dynamic Visualizations Area */}
        <div className="space-y-6">
          <Card noPadding>
            <div className="p-5 space-y-8">
                {/* ── SECTION 1: Scientific Petroleum Geochemistry Dashboard Grid ── */}
                <div className="space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-800">Scientific Petroleum Geochemistry Dashboard</h3>
                    <p className="text-[10px] text-slate-400">
                      Standard petroleum geochemistry visualizations compiled dynamically based on Variable Registry specifications.
                    </p>
                  </div>

                  {scientificLoading ? (
                    <div className="h-96 flex items-center justify-center">
                      <Spinner />
                    </div>
                  ) : !scientificData || scientificData.length === 0 ? (
                    <div className="h-96 flex items-center justify-center text-slate-400 text-xs italic">
                      No records available for visualization.
                    </div>
                  ) : (() => {
                    const activeCharts = generateScientificCharts(activeDataset?.variables || [], scientificData);

                    const defaultChartIds = ['s2_vs_toc', 'hi_vs_tmax'];
                    const visibleCharts = defaultChartIds
                      .map(id => activeCharts.find(c => c.id === id))
                      .filter(Boolean) as any[];

                    if (visibleCharts.length === 0) {
                      return null;
                    }

                    return (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 gap-8 animate-fade-in w-full">
                          {visibleCharts.map((chart) => (
                              <Card key={chart.id} className="border border-slate-200 shadow-xs overflow-hidden flex flex-col w-full p-5 rounded-2xl">
                                 <div className="border-b border-slate-100 pb-3 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                   <div className="w-full sm:w-auto flex-1 flex justify-center text-center">
                                     <div className="inline-block border border-slate-200/80 px-4 py-1.5 rounded-lg bg-slate-50/50 shadow-2xs">
                                       <h4 className="text-base font-bold text-slate-800 tracking-tight text-center">{chart.title}</h4>
                                     </div>
                                   </div>
                                   <div className="flex items-center gap-3 self-center sm:self-auto shrink-0">
                                     {chart.id === 's2_vs_toc' && (
                                       <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200/50 shadow-4xs">
                                         <button
                                           onClick={() => setS2TocColorBy('well')}
                                           className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                                             s2TocColorBy === 'well'
                                               ? 'bg-white text-slate-800 shadow-2xs'
                                               : 'text-slate-500 hover:text-slate-700'
                                           }`}
                                         >
                                           Color by Well
                                         </button>
                                         <button
                                           onClick={() => setS2TocColorBy('formation')}
                                           className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                                             s2TocColorBy === 'formation'
                                               ? 'bg-white text-slate-800 shadow-2xs'
                                               : 'text-slate-500 hover:text-slate-700'
                                           }`}
                                         >
                                           Color by Formation
                                         </button>
                                       </div>
                                     )}
                                     {chart.id === 'hi_vs_tmax' && (
                                       <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200/50 shadow-4xs">
                                         <button
                                           onClick={() => setHiTmaxColorBy('well')}
                                           className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                                             hiTmaxColorBy === 'well'
                                               ? 'bg-white text-slate-800 shadow-2xs'
                                               : 'text-slate-500 hover:text-slate-700'
                                           }`}
                                         >
                                           Color by Well
                                         </button>
                                         <button
                                           onClick={() => setHiTmaxColorBy('formation')}
                                           className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                                             hiTmaxColorBy === 'formation'
                                               ? 'bg-white text-slate-800 shadow-2xs'
                                               : 'text-slate-500 hover:text-slate-700'
                                           }`}
                                         >
                                           Color by Formation
                                         </button>
                                       </div>
                                     )}
                                     {(chart.id === 's2_vs_toc' || chart.id === 'hi_vs_tmax') && (
                                       <button
                                         onClick={() => toggleStats(chart.id)}
                                         className="text-xs font-bold text-ongc-blue hover:text-ongc-blueDark transition-colors bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg shadow-4xs flex items-center gap-1.5"
                                       >
                                         <span>📊</span>
                                         <span>{collapsedStats[chart.id] ? 'Expand Summary' : 'Collapse Summary'}</span>
                                       </button>
                                     )}
                                   </div>
                                 </div>
                                 <div className="flex-1 flex flex-col lg:flex-row gap-6 w-full min-w-0">
                                   <div className="flex-1 min-w-0 w-full">
                                     <DynamicPlotlyChart
                                      chartType={chart.chartType}
                                      data={chart.data}
                                      xLabel={chart.xLabel}
                                      yLabel={chart.yLabel}
                                      colorByLabel={chart.colorByLabel}
                                      title={chart.id === 's2_vs_toc' || chart.id === 'hi_vs_tmax' ? '' : chart.title}
                                      onPointClick={setSelectedPoint}
                                      height={chart.id === 's2_vs_toc' || chart.id === 'hi_vs_tmax' ? 'h-[780px]' : undefined}
                                    />
                                  </div>
                                  {!collapsedStats['s2_vs_toc'] && chart.id === 's2_vs_toc' && (
                                    (() => {
                                      const stats = computeS2TocStats(chart.data);
                                      return (
                                        <div className="lg:w-80 w-full shrink-0 bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex flex-col space-y-4 select-none">
                                          <div>
                                            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Summary Analytics</h5>
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                              <div className="bg-white p-2.5 border border-slate-100 rounded-lg shadow-3xs">
                                                <span className="text-[10px] text-slate-400 block">Avg TOC (%)</span>
                                                <span className="text-sm font-bold text-slate-700">{stats.avgToc.toFixed(2)}%</span>
                                              </div>
                                              <div className="bg-white p-2.5 border border-slate-100 rounded-lg shadow-3xs">
                                                <span className="text-[10px] text-slate-400 block">Avg S2 (mg/g)</span>
                                                <span className="text-sm font-bold text-slate-700">{stats.avgS2.toFixed(2)}</span>
                                              </div>
                                            </div>
                                            <div className="bg-white mt-2 p-2.5 border border-slate-100 rounded-lg shadow-3xs flex justify-between items-center">
                                              <span className="text-[10px] text-slate-400">Total Samples</span>
                                              <span className="text-xs font-bold text-slate-700">{stats.total}</span>
                                            </div>
                                          </div>

                                          <div className="border-t border-slate-200/60 pt-3 space-y-2">
                                            <h6 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">TOC Class Distribution</h6>
                                            <div className="space-y-1.5 text-xs text-slate-600">
                                              {[
                                                { label: 'Poor (0–0.5%)', val: stats.tocCounts.poor, color: 'bg-red-400' },
                                                { label: 'Fair (0.5–1%)', val: stats.tocCounts.fair, color: 'bg-orange-400' },
                                                { label: 'Good (1–2%)', val: stats.tocCounts.good, color: 'bg-yellow-500' },
                                                { label: 'Very Good (2–4%)', val: stats.tocCounts.veryGood, color: 'bg-green-400' },
                                                { label: 'Excellent (>4%)', val: stats.tocCounts.excellent, color: 'bg-emerald-500' }
                                              ].map(c => (
                                                <div key={c.label} className="space-y-0.5">
                                                  <div className="flex justify-between text-[10px]">
                                                    <span className="font-medium text-slate-500">{c.label}</span>
                                                    <span className="font-bold text-slate-700">{c.val} ({stats.total > 0 ? ((c.val / stats.total) * 100).toFixed(0) : 0}%)</span>
                                                  </div>
                                                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                                    <div className={`${c.color} h-full`} style={{ width: `${stats.total > 0 ? ((c.val / stats.total) * 100) : 0}%` }} />
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>

                                          <div className="border-t border-slate-200/60 pt-3 space-y-2">
                                            <h6 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">S2 Class Distribution</h6>
                                            <div className="space-y-1.5 text-xs text-slate-600">
                                              {[
                                                { label: 'Poor (0–2.5)', val: stats.s2Counts.poor, color: 'bg-red-400' },
                                                { label: 'Fair (2.5–5)', val: stats.s2Counts.fair, color: 'bg-orange-400' },
                                                { label: 'Good (5–10)', val: stats.s2Counts.good, color: 'bg-yellow-500' },
                                                { label: 'Very Good (10–20)', val: stats.s2Counts.veryGood, color: 'bg-green-400' },
                                                { label: 'Excellent (>20)', val: stats.s2Counts.excellent, color: 'bg-emerald-500' }
                                              ].map(c => (
                                                <div key={c.label} className="space-y-0.5">
                                                  <div className="flex justify-between text-[10px]">
                                                    <span className="font-medium text-slate-500">{c.label}</span>
                                                    <span className="font-bold text-slate-700">{c.val} ({stats.total > 0 ? ((c.val / stats.total) * 100).toFixed(0) : 0}%)</span>
                                                  </div>
                                                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                                    <div className={`${c.color} h-full`} style={{ width: `${stats.total > 0 ? ((c.val / stats.total) * 100) : 0}%` }} />
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()
                                  )}
                                  {!collapsedStats['hi_vs_tmax'] && chart.id === 'hi_vs_tmax' && (
                                    (() => {
                                      const stats = computeHiTmaxStats(chart.data);
                                      return (
                                        <div className="lg:w-80 w-full shrink-0 bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex flex-col space-y-4 select-none">
                                          <div>
                                            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Summary Analytics</h5>
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                              <div className="bg-white p-2.5 border border-slate-100 rounded-lg shadow-3xs">
                                                <span className="text-[10px] text-slate-400 block">Avg Tmax (°C)</span>
                                                <span className="text-sm font-bold text-slate-700">{stats.avgTmax.toFixed(1)}°C</span>
                                              </div>
                                              <div className="bg-white p-2.5 border border-slate-100 rounded-lg shadow-3xs">
                                                <span className="text-[10px] text-slate-400 block">Avg HI (mg/g)</span>
                                                <span className="text-sm font-bold text-slate-700">{stats.avgHi.toFixed(1)}</span>
                                              </div>
                                            </div>
                                            
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                              <div className="bg-white p-2 border border-slate-100 rounded-lg shadow-3xs">
                                                <span className="text-[9px] text-slate-400 block">HI Min / Max</span>
                                                <span className="text-xs font-semibold text-slate-700">{stats.minHi.toFixed(0)} / {stats.maxHi.toFixed(0)}</span>
                                              </div>
                                              <div className="bg-white p-2 border border-slate-100 rounded-lg shadow-3xs">
                                                <span className="text-[9px] text-slate-400 block">Tmax Min / Max</span>
                                                <span className="text-xs font-semibold text-slate-700">{stats.minTmax.toFixed(0)} / {stats.maxTmax.toFixed(0)}</span>
                                              </div>
                                            </div>

                                            <div className="bg-white mt-2 p-2.5 border border-slate-100 rounded-lg shadow-3xs flex justify-between items-center">
                                              <span className="text-[10px] text-slate-400">Total Samples</span>
                                              <span className="text-xs font-bold text-slate-700">{stats.total}</span>
                                            </div>
                                          </div>

                                          <div className="border-t border-slate-200/60 pt-3 space-y-2">
                                            <div className="bg-white border border-slate-200/80 rounded-lg p-2.5 text-[10px] text-slate-500 space-y-1 shadow-3xs leading-relaxed">
                                              <p>• <b>HI</b> is Hydrogen Index expressed in mg HC/g TOC.</p>
                                              <p>• <b>Tmax</b> is Temperature where S2 reaches its maximum value expressed in °C.</p>
                                            </div>
                                          </div>

                                          <div className="border-t border-slate-200/60 pt-3 space-y-2">
                                            <h6 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Thermal Maturity Stages</h6>
                                            <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
                                              <table className="min-w-full text-[10px] text-slate-600">
                                                <thead className="bg-slate-50 border-b border-slate-200/80">
                                                  <tr>
                                                    <th className="px-2 py-1 text-left font-bold text-slate-500 uppercase tracking-wide">VRo (%)</th>
                                                    <th className="px-2 py-1 text-left font-bold text-slate-500 uppercase tracking-wide">Stage of Thermal Maturity for Oil</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                  {[
                                                    { range: '0.20–0.60', stage: 'Immature' },
                                                    { range: '0.60–0.65', stage: 'Early Mature' },
                                                    { range: '0.65–0.90', stage: 'Peak Mature' },
                                                    { range: '0.90–1.35', stage: 'Late Mature' },
                                                    { range: '>1.35', stage: 'Post Mature' }
                                                  ].map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/50">
                                                      <td className="px-2 py-1.5 font-medium">{item.range}</td>
                                                      <td className="px-2 py-1.5 font-bold text-slate-700">{item.stage}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()
                                  )}
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                </div>

                {/* ── SECTION 2: Dynamic Interactive Custom Chart Builder (Collapsible) ── */}
                <div className="pt-6 border-t border-slate-200">
                  <div 
                    onClick={() => setShowCustomBuilder(prev => !prev)}
                    className="flex items-center justify-between p-4 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer rounded-xl border border-slate-200/80 transition-all select-none shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-ongc-blue/10 text-ongc-blue">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-800">Dynamic Interactive Custom Chart Builder</h3>
                          <Badge label={showCustomBuilder ? 'Open' : 'Collapsed'} customColor={showCustomBuilder ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'} />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Build, custom-configure, and plot dynamic crossplots, depth profiles, distributions & matrices from any registered scientific variable.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <span>{showCustomBuilder ? 'Hide Builder' : 'Expand Builder'}</span>
                      {showCustomBuilder ? (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </div>

                  {showCustomBuilder && (
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">X Variable</label>
                          <select
                            value={xVar}
                            onChange={(e) => setXVar(e.target.value)}
                            className="w-full text-xs rounded-lg border-slate-200 bg-white py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                          >
                            {activeDataset?.variables?.map((v) => (
                              <option key={v.id} value={v.sql_column_name}>
                                {v.display_name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {chartType !== 'correlation_matrix' && chartType !== 'histogram' && chartType !== 'pie' && chartType !== 'treemap' && chartType !== 'sunburst' && (
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Y Variable</label>
                            <select
                              value={yVar}
                              onChange={(e) => setYVar(e.target.value)}
                              className="w-full text-xs rounded-lg border-slate-200 bg-white py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                            >
                              <option value="">None (Histogram count)</option>
                              {activeDataset?.variables
                                ?.filter((v) => v.is_numeric)
                                ?.map((v) => (
                                  <option key={v.id} value={v.sql_column_name}>
                                      {v.display_name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}

                        {chartType === '3d_scatter' && (
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Z Variable</label>
                            <select
                              value={zVar}
                              onChange={(e) => setZVar(e.target.value)}
                              className="w-full text-xs rounded-lg border-slate-200 bg-white py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                            >
                              <option value="">None</option>
                              {activeDataset?.variables
                                ?.filter((v) => v.is_numeric)
                                ?.map((v) => (
                                  <option key={v.id} value={v.sql_column_name}>
                                    {v.display_name}
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
                              className="w-full text-xs rounded-lg border-slate-200 bg-white py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                            >
                              <option value="">None</option>
                              {activeDataset?.variables
                                ?.filter((v) => !v.is_numeric)
                                ?.map((v) => (
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
                            className="w-full text-xs rounded-lg border-slate-200 bg-white py-1 px-2 focus:ring-1 focus:ring-ongc-blue"
                          >
                            <option value="scatter">Scatter Plot</option>
                            <option value="line">Line Graph</option>
                            <option value="bar">Bar Chart</option>
                            <option value="horizontal_bar">Horizontal Bar Chart</option>
                            <option value="histogram">Histogram</option>
                            <option value="depth_profile">Depth Profile Log</option>
                            <option value="boxplot">Box Plot</option>
                            <option value="violin">Violin Plot</option>
                            <option value="area">Area Plot</option>
                            <option value="pie">Pie Chart</option>
                            <option value="treemap">Treemap</option>
                            <option value="sunburst">Sunburst Chart</option>
                            <option value="bubble">Bubble Chart</option>
                            <option value="3d_scatter">3D Scatter Plot</option>
                            <option value="contour">Contour Plot</option>
                            <option value="correlation_matrix">Correlation Matrix</option>
                          </select>
                        </div>
                      </div>

                      {/* Plotly Canvas Container */}
                      {chartLoading ? (
                        <div className="h-80 flex items-center justify-center">
                          <Spinner />
                        </div>
                      ) : (
                        <div className="h-[500px] w-full bg-white rounded-xl p-2 border border-slate-100 shadow-2xs">
                          <DynamicPlotlyChart
                            chartType={chartType}
                            data={chartData || []}
                            xLabel={xVar}
                            yLabel={yVar}
                            colorByLabel={colorBy || undefined}
                            title={yVar ? `${activeDataset?.variables?.find(v => v.sql_column_name === xVar)?.display_name || xVar} vs ${activeDataset?.variables?.find(v => v.sql_column_name === yVar)?.display_name || yVar}` : `${activeDataset?.variables?.find(v => v.sql_column_name === xVar)?.display_name || xVar} Distribution`}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>



          {selectedPoint && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-premium w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">Sample Row Details</h3>
                  <button
                    onClick={() => setSelectedPoint(null)}
                    className="text-slate-400 hover:text-slate-655 text-xs font-bold px-2.5 py-1 rounded-md hover:bg-slate-200/50 transition-colors"
                  >
                    Close
                  </button>
                </div>
                {/* Modal Content */}
                <div className="p-6 space-y-4 text-xs text-slate-700">
                  <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
                    <div>
                      <span className="font-semibold text-slate-400 uppercase tracking-wider block text-[10px] mb-0.5">Sample Type</span>
                      <span className="font-bold text-slate-800 text-sm">{selectedPoint.sample_type || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-400 uppercase tracking-wider block text-[10px] mb-0.5">Formation</span>
                      <span className="font-bold text-slate-800 text-sm">{selectedPoint.formation || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
                    <div>
                      <span className="font-semibold text-slate-400 uppercase tracking-wider block text-[10px] mb-0.5">Depth</span>
                      <span className="font-bold text-slate-800 text-sm">{selectedPoint.top_depth !== undefined && selectedPoint.top_depth !== 'N/A' ? `${selectedPoint.top_depth} m` : 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-400 uppercase tracking-wider block text-[10px] mb-0.5">Range</span>
                      <span className="font-bold text-slate-800 text-sm">{selectedPoint.sample_id || 'N/A'}</span>
                    </div>
                  </div>
                   <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
                    {selectedPoint.chart_id === 'hi_vs_tmax' ? (
                      <>
                        <div>
                          <span className="font-semibold text-slate-400 uppercase tracking-wider block text-[10px] mb-0.5">Tmax (°C)</span>
                          <span className="font-bold text-slate-800 text-sm">{selectedPoint.x !== undefined ? `${selectedPoint.x} °C` : 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-400 uppercase tracking-wider block text-[10px] mb-0.5">HI (mg HC/g TOC)</span>
                          <span className="font-bold text-slate-800 text-sm">{selectedPoint.y !== undefined ? `${selectedPoint.y}` : 'N/A'}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="font-semibold text-slate-400 uppercase tracking-wider block text-[10px] mb-0.5">TOC (wt%)</span>
                          <span className="font-bold text-slate-800 text-sm">{selectedPoint.x !== undefined ? `${selectedPoint.x} %` : 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-400 uppercase tracking-wider block text-[10px] mb-0.5">S2 (mg HC/g rock)</span>
                          <span className="font-bold text-slate-800 text-sm">{selectedPoint.y !== undefined ? `${selectedPoint.y} mg/g` : 'N/A'}</span>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Dynamic Additional Metadata */}
                  {(() => {
                    const standardKeys = [
                      'x', 'y', 'chart_id', 'color_by', 'sample_type', 'formation', 'top_depth', 'sample_id',
                      'lithology', 'layer_name', 'tmax', 'hi', 'borehole_name', 'well_name', 'well', 'depth', 'id', 'ubhi'
                    ];
                    const extraFields = Object.keys(selectedPoint).filter(
                      (k) => !standardKeys.includes(k) && selectedPoint[k] !== undefined && selectedPoint[k] !== null && String(selectedPoint[k]).trim() !== ''
                    );
                    if (extraFields.length === 0) return null;
                    return (
                      <div className="pt-3 border-t border-slate-100 mt-3">
                        <span className="font-semibold text-slate-400 uppercase tracking-wider block text-[10px] mb-2">Additional Metadata</span>
                        <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
                          {extraFields.map((key) => {
                            const dispKey = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                            return (
                              <div key={key} className="bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                                <span className="text-[9px] text-slate-400 block font-medium uppercase tracking-wider mb-0.5">{dispKey}</span>
                                <span className="font-bold text-slate-700 text-sm">{String(selectedPoint[key])}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
