import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Database,
  Layers,
  Filter,
  RefreshCw,
  BarChart2,
  CheckSquare,
  Square,
  Search,
  Sliders,
  FileText,
  Download,
  Flame,
  Save,
  Trash,
  Plus,
  ArrowRightLeft,
  AlertCircle,
  FolderHeart,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Spinner } from '../components/common/Spinner';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { formatNumber } from '../utils/formatters';
import { DynamicPlotlyChart } from '../components/charts/DynamicPlotlyChart';
import { DashboardDatasetTable } from '../components/common/DashboardDatasetTable';
import api from '../services/api';

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
  graph_config?: any[];
}

interface SavedChart {
  id: string;
  name: string;
  selectedLab: string;
  isCrossDataset: boolean;
  selectedDatasetId: number;
  selectedDatasetId2: number | null;
  xVar: string;
  yVar: string;
  zVar: string;
  colorBy: string;
  chartType: string;
  filters: Record<string, string>;
  multiFilters: Record<string, string[]>;
  activeGraphIndex?: number;
}

const getLabNameForModule = (module: string): string => {
  const m = module.toLowerCase();
  if (m === 'geochemistry' || m === 'source-rock') return 'Source Rock Laboratory';
  if (m === 'oil') return 'Oil Laboratory';
  if (m === 'isotope') return 'Stable Isotope Laboratory';
  if (m === 'biomarker') return 'Biomarker Laboratory';
  if (m === 'surface') return 'Surface Geochemistry / MBER';
  return module.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' Laboratory';
};

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
  depth: ['depth', 'md', 'tvd', 'top depth', 'sample top', 'depth (m)', 'sample_top', 'depth_top', 'interval_top'],
  well: ['well', 'well name', 'borehole', 'borehole name', 'well_name', 'borehole_name', 'name'],
  lithology: ['lithology', 'lith', 'lithology type', 'sample type', 'lithology_type'],
  formation: ['formation', 'fm', 'stratigraphy'],
  pr_by_ph: ['pr/ph', 'pr_by_ph', 'pristane/phytane', 'pr_ph_ratio'],
  pr_by_nc17: ['pr/nc17', 'pr_by_nc17', 'pristane/nc17'],
  ph_by_nc18: ['ph/nc18', 'ph_by_nc18', 'phytane/nc18'],
  sulfur: ['sulfur', 'sulphur', 's', 'sulfur_content', 'sulfur (%)', 's (wt%)', 's (wt.%)', 's_wt_perc'],
  api_gravity: ['api', 'api gravity', 'api_gravity']
};

export const DynamicDashboard: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramDataset = searchParams.get('dataset');
  const paramLab = searchParams.get('lab');

  // Core Selector States
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [activeGraphIndex, setActiveGraphIndex] = useState<number>(0);

  // Advanced Analysis states
  const [isCrossDataset, setIsCrossDataset] = useState<boolean>(false);
  const [selectedDatasetId2, setSelectedDatasetId2] = useState<number | null>(null);
  
  // Custom builder options (free-form chart creation)
  const [useCustomBuilder, setUseCustomBuilder] = useState<boolean>(false);
  const [xVarCustom, setXVarCustom] = useState<string>('');
  const [yVarCustom, setYVarCustom] = useState<string>('');
  const [zVarCustom, setZVarCustom] = useState<string>('');
  const [colorByCustom, setColorByCustom] = useState<string>('');
  const [chartTypeCustom, setChartTypeCustom] = useState<string>('scatter');

  // Collapsible panels
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Filter conditions
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [multiFilters, setMultiFilters] = useState<Record<string, string[]>>({});
  const [filterSearches, setFilterSearches] = useState<Record<string, string>>({});

  // Saved Workspaces state
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
  const [newChartName, setNewChartName] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);

  // 1. Fetch Registered Datasets dynamically
  const { data: datasets, isLoading: datasetsLoading } = useQuery<DatasetDef[]>({
    queryKey: ['datasets'],
    queryFn: () => api.get<DatasetDef[]>('/datasets').then((res) => res.data),
  });

  const activeDataset = datasets?.find((d) => d.id === selectedDatasetId);
  const activeDataset2 = datasets?.find((d) => d.id === selectedDatasetId2);

  // Load Saved Workspaces on mount
  useEffect(() => {
    const saved = localStorage.getItem('ongc_lims_saved_charts');
    if (saved) {
      try {
        setSavedCharts(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved charts', e);
      }
    }
  }, []);

  // Sync Search Parameters
  useEffect(() => {
    if (!datasets || datasets.length === 0) return;

    if (paramDataset) {
      const match = datasets.find(
        (d) => d.name.toLowerCase() === paramDataset.toLowerCase() || d.id === parseInt(paramDataset)
      );
      if (match) {
        setSelectedDatasetId(match.id);
        setActiveGraphIndex(0);
        return;
      }
    }

    if (paramLab) {
      const match = datasets.find(
        (d) => d.module.toLowerCase() === paramLab.toLowerCase() || getLabNameForModule(d.module).toLowerCase().includes(paramLab.toLowerCase())
      );
      if (match) {
        setSelectedDatasetId(match.id);
        setActiveGraphIndex(0);
        return;
      }
    }

    // Set first dataset as default if nothing selected
    if (selectedDatasetId === null && datasets.length > 0) {
      setSelectedDatasetId(datasets[0].id);
    }
  }, [paramDataset, paramLab, datasets]);

  // Handle dataset change: Reset graph selection & filters
  const handleDatasetChange = (id: number) => {
    setSelectedDatasetId(id);
    setActiveGraphIndex(0);
    setIsCrossDataset(false);
    setSelectedDatasetId2(null);
    setUseCustomBuilder(false);
    setFilters({});
    setMultiFilters({});
    setFilterSearches({});
  };

  // Compile filters for requests
  const compileFilters = () => {
    const active: Record<string, any> = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) active[k] = v;
    });
    Object.entries(multiFilters).forEach(([k, v]) => {
      if (v && v.length > 0) {
        active[k] = v.join(',');
      }
    });
    return active;
  };

  const serializedFilters = JSON.stringify(compileFilters());

  // 2. Fetch distinct options & bounds from metadata
  const { data: metadata, isLoading: metadataLoading } = useQuery<any>({
    queryKey: ['dataset-metadata', selectedDatasetId],
    queryFn: () =>
      api.get<any>('/metadata', { params: { dataset_id: selectedDatasetId } }).then((res) => res.data),
    enabled: selectedDatasetId !== null,
  });

  // 3. Fetch Full Scientific Records for plotting
  const { data: scientificRecords, isLoading: recordsLoading } = useQuery<any[]>({
    queryKey: ['scientific-plots-data', selectedDatasetId, serializedFilters],
    queryFn: () =>
      api
        .get<any[]>('/dashboard/scientific-plots', {
          params: {
            dataset_id: selectedDatasetId,
            ...compileFilters(),
          },
        })
        .then((res) => res.data),
    enabled: selectedDatasetId !== null && !isCrossDataset,
  });

  // 4. Fetch Cross Dataset merged coordinate pairs
  const { data: crossPlotData, isLoading: crossPlotLoading, error: crossPlotError, isError: isCrossPlotError } = useQuery<any[]>({
    queryKey: [
      'cross-dataset-data',
      selectedDatasetId,
      selectedDatasetId2,
      xVarCustom,
      yVarCustom,
      serializedFilters,
    ],
    queryFn: async () => {
      if (!selectedDatasetId || !selectedDatasetId2 || !xVarCustom || !yVarCustom) return [];
      const res = await api.get<any[]>('/dashboard/cross-chart-data', {
        params: {
          dataset_id_1: selectedDatasetId,
          x_axis_1: xVarCustom,
          dataset_id_2: selectedDatasetId2,
          y_axis_2: yVarCustom,
          ...compileFilters(),
        },
      });
      return res.data;
    },
    enabled: isCrossDataset && selectedDatasetId !== null && selectedDatasetId2 !== null && xVarCustom !== '' && yVarCustom !== '',
    retry: false
  });

  // Dynamic Synonym Matching Engine
  const findColByRole = (role: string): string | null => {
    if (!activeDataset) return null;
    const r = role.toLowerCase();
    const synonyms = (rolesMap as any)[r] || [r];

    const matched = activeDataset.variables.find((v) => {
      const vName = v.name.toLowerCase();
      const vSql = v.sql_column_name.toLowerCase();
      const vDisp = v.display_name.toLowerCase();
      const vSyns = v.synonyms || [];

      return (
        synonyms.includes(vName) ||
        synonyms.includes(vSql) ||
        synonyms.includes(vDisp) ||
        vSyns.some((s: string) => synonyms.includes(s.toLowerCase()))
      );
    });

    if (matched) return matched.sql_column_name;

    const fallback = activeDataset.variables.find((v) =>
      synonyms.some((syn) =>
        v.sql_column_name.toLowerCase().includes(syn) ||
        v.display_name.toLowerCase().includes(syn)
      )
    );

    return fallback ? fallback.sql_column_name : null;
  };

  // Pearson Correlation calculation helper
  const calculateCorrelationMatrix = (data: any[], numericCols: string[]) => {
    const n = data.length;
    if (n < 2 || numericCols.length === 0) {
      return { labels: [], z: [] };
    }
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

  // Generate scientific traces from rows using custom logic
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

    const prC17Col = findColByRole('pr_by_nc17');
    const phC18Col = findColByRole('ph_by_nc18');
    const prPhCol = findColByRole('pr_by_ph');
    const apiCol = findColByRole('api_gravity');
    const sulfurCol = findColByRole('sulfur');

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
        .filter(p => p !== null);
    };

    const getS2TocPoints = (xCol: string, yCol: string) => {
      return data
        .map(pt => {
          const xVal = pt[xCol];
          const yVal = pt[yCol];
          if (xVal === undefined || xVal === null) return null;
          if (yVal === undefined || yVal === null) return null;
          return {
            x: xVal,
            y: yVal,
            well_name: pt['well_name'] || pt['well'] || pt[wellCol || ''] || 'N/A',
            sample_id: pt['sample_id'] || pt['sample'] || pt['id'] || 'N/A',
            formation: pt['formation'] || pt['fm'] || pt[formationCol || ''] || 'N/A',
            layer: pt['layer'] || 'N/A',
            top_depth: pt['top_depth'] !== undefined ? pt['top_depth'] : (pt['depth_from'] || pt['depth'] || 'N/A'),
            bottom_depth: pt['bottom_depth'] !== undefined ? pt['bottom_depth'] : (pt['depth_to'] || 'N/A'),
            sample_type: pt['sample_type'] || pt['type'] || pt[lithCol || ''] || 'N/A',
            dataset_name: activeDataset?.display_name || 'N/A'
          };
        })
        .filter(p => p !== null);
    };

    const getHiTmaxPoints = (xCol: string, yCol: string) => {
      return data
        .map(pt => {
          const xVal = pt[xCol];
          const yVal = pt[yCol];
          if (xVal === undefined || xVal === null) return null;
          if (yVal === undefined || yVal === null) return null;
          return {
            x: xVal,
            y: yVal,
            well_name: pt['well_name'] || pt['well'] || pt[wellCol || ''] || 'N/A',
            sample_id: pt['sample_id'] || pt['sample'] || pt['id'] || 'N/A',
            formation: pt['formation'] || pt['fm'] || pt[formationCol || ''] || 'N/A',
            layer: pt['layer'] || 'N/A',
            top_depth: pt['top_depth'] !== undefined ? pt['top_depth'] : (pt['depth_from'] || pt['depth'] || 'N/A'),
            bottom_depth: pt['bottom_depth'] !== undefined ? pt['bottom_depth'] : (pt['depth_to'] || 'N/A'),
            toc: pt['toc'] || pt['average_toc'] || 'N/A',
            s2: pt['s2'] || pt['average_s2'] || 'N/A'
          };
        })
        .filter(p => p !== null);
    };

    const addScatterChart = (id: string, title: string, xCol: string, yCol: string, xLabelName?: string, yLabelName?: string) => {
      const pts = getPoints(xCol, yCol, wellCol);
      if (pts.length > 0) {
        charts.push({
          id: id,
          title: title,
          chartType: 'scatter',
          xLabel: xLabelName || variables.find((v) => v.sql_column_name === xCol)?.display_name || xCol,
          yLabel: yLabelName || variables.find((v) => v.sql_column_name === yCol)?.display_name || yCol,
          data: pts
        });
      }
    };

    // 1. S2 vs TOC
    if (tocCol && s2Col) {
      const s2TocPts = getS2TocPoints(tocCol, s2Col);
      if (s2TocPts.length > 0) {
        charts.push({
          id: 's2_vs_toc',
          title: 'S2 vs TOC Geochemistry Interpretation',
          chartType: 's2_vs_toc',
          xLabel: 'TOC (% wt.)',
          yLabel: 'Hydrocarbon Generation Potential: S2 (mgHC/gm rock)',
          data: s2TocPts
        });
      }
    }

    // 2. HI vs Tmax
    if (hiCol && tmaxCol) {
      const hiTmaxPts = getHiTmaxPoints(tmaxCol, hiCol);
      if (hiTmaxPts.length > 0) {
        charts.push({
          id: 'hi_vs_tmax',
          title: 'HI vs Tmax Plot',
          chartType: 'hi_vs_tmax',
          xLabel: 'Tmax (°C)',
          yLabel: 'Hydrogen Index (mg HC/g TOC)',
          data: hiTmaxPts
        });
      }
    }

    // 3. HI vs TOC Crossplot
    if (tocCol && hiCol) {
      addScatterChart('toc_vs_hi', 'HI vs TOC Crossplot', tocCol, hiCol);
    }

    // 4. OI vs TOC Crossplot
    if (tocCol && oiCol) {
      addScatterChart('toc_vs_oi', 'OI vs TOC Crossplot', tocCol, oiCol);
    }

    // 5. S2 vs Tmax Crossplot
    if (s2Col && tmaxCol) {
      addScatterChart('s2_vs_tmax', 'S2 vs Tmax Crossplot', tmaxCol, s2Col);
    }

    // 6. S1 vs S2 Hydrocarbon Potential
    if (s1Col && s2Col) {
      addScatterChart('s1_vs_s2', 'S1 vs S2 Hydrocarbon Potential', s2Col, s1Col);
    }

    // 7. PI vs TOC Maturity Plot
    if (piCol && tocCol) {
      addScatterChart('pi_vs_toc', 'PI vs TOC Maturity Plot', tocCol, piCol);
    }

    // 8. OSI vs TOC Reservoir Quality
    if (osiCol && tocCol) {
      addScatterChart('osi_vs_toc', 'OSI vs TOC Reservoir Quality', tocCol, osiCol);
    }

    // 9. HI vs OI Pseudo-Van Krevelen
    if (hiCol && oiCol) {
      addScatterChart('hi_vs_oi', 'HI vs OI Pseudo-Van Krevelen', oiCol, hiCol);
    }

    // 10. TOC vs VRo Thermal Maturity
    if (tocCol && vroCol) {
      addScatterChart('toc_vs_vro', 'TOC vs VRo Thermal Maturity', vroCol, tocCol);
    }

    // 11. Pristane/n-C17 vs Phytane/n-C18
    if (prC17Col && phC18Col) {
      const pts = getPoints(phC18Col, prC17Col, wellCol);
      if (pts.length > 0) {
        charts.push({
          id: 'pr_nc17_vs_ph_nc18',
          title: 'Pristane/n-C17 vs Phytane/n-C18 Plot',
          chartType: 'pr_nc17_vs_ph_nc18',
          xLabel: 'Phytane/n-C18',
          yLabel: 'Pristane/n-C17',
          data: pts
        });
      }
    }

    // 12. Pr/Ph vs Pr/n-C17 Plot
    if (prPhCol && prC17Col) {
      addScatterChart('pr_by_ph_vs_pr_by_nc17', 'Pr/Ph vs Pr/n-C17 Plot', prC17Col, prPhCol);
    }

    // 13. API Gravity vs Sulfur Plot
    if (apiCol && sulfurCol) {
      addScatterChart('api_vs_sulfur', 'API Gravity vs Sulfur Plot', sulfurCol, apiCol);
    }

    // Depth Profiles
    if (depthCol) {
      const depthProfileCandidates = [
        { col: tocCol, id: 'toc_depth', label: 'TOC Depth Profile' },
        { col: s2Col, id: 's2_depth', label: 'S2 Depth Profile' },
        { col: hiCol, id: 'hi_depth', label: 'HI Depth Profile' },
        { col: oiCol, id: 'oi_depth', label: 'OI Depth Profile' },
        { col: piCol, id: 'pi_depth', label: 'PI Depth Profile' },
        { col: vroCol, id: 'vro_depth', label: 'VRo Depth Profile' }
      ];
      depthProfileCandidates.forEach((cand) => {
        if (cand.col && cand.col !== depthCol) {
          const pts = getPoints(cand.col, depthCol, wellCol);
          if (pts.length > 0) {
            charts.push({
              id: cand.id,
              title: cand.label,
              chartType: 'depth_profile',
              xLabel: variables.find((v) => v.sql_column_name === cand.col)?.display_name || cand.col,
              yLabel: variables.find((v) => v.sql_column_name === depthCol)?.display_name || depthCol,
              data: pts
            });
          }
        }
      });
    }

    // Generic fallback
    if (charts.length === 0) {
      const numericVars = variables.filter((v) => v.is_numeric && v.sql_column_name.toLowerCase() !== 'id');
      if (numericVars.length >= 2) {
        const xCol = numericVars[0].sql_column_name;
        const yCol = numericVars[1].sql_column_name;
        const pts = getPoints(xCol, yCol, wellCol);
        if (pts.length > 0) {
          charts.push({
            id: 'generic_scatter',
            title: `${numericVars[0].display_name} vs ${numericVars[1].display_name} Plot`,
            chartType: 'scatter',
            xLabel: numericVars[0].display_name,
            yLabel: numericVars[1].display_name,
            data: pts
          });
        }
      }
    }

    return charts;
  };

  // Compile scientific plots dynamically
  const availablePlots = React.useMemo(() => {
    if (!activeDataset || !scientificRecords) return [];
    return generateScientificCharts(activeDataset.variables, scientificRecords);
  }, [activeDataset, scientificRecords]);

  // Read current active graph configuration
  const activeGraph = React.useMemo(() => {
    if (!activeDataset) return null;
    const configs = activeDataset.graph_config || [];
    if (configs.length > 0 && configs[activeGraphIndex]) {
      return configs[activeGraphIndex];
    }
    // Fallback if graph_config doesn't specify index
    return configs[0] || null;
  }, [activeDataset, activeGraphIndex]);

  // Match activeGraph configuration with processed availablePlots
  const plotToRender = React.useMemo(() => {
    if (isCrossDataset) {
      return {
        chartType: chartTypeCustom || 'scatter',
        xLabel: activeDataset?.variables?.find((v) => v.sql_column_name === xVarCustom)?.display_name || xVarCustom,
        yLabel: activeDataset2?.variables?.find((v) => v.sql_column_name === yVarCustom)?.display_name || yVarCustom,
        title: 'Cross-Dataset Correlation Plot',
        data: crossPlotData || []
      };
    }

    if (useCustomBuilder) {
      const getLabel = (col: string, ds: DatasetDef | undefined) =>
        ds?.variables?.find((v) => v.sql_column_name === col)?.display_name || col;
      
      const pts = (scientificRecords || [])
        .map((pt) => ({
          x: pt[xVarCustom],
          y: yVarCustom ? pt[yVarCustom] : undefined,
          z: zVarCustom ? pt[zVarCustom] : undefined,
          color_by: colorByCustom ? String(pt[colorByCustom]) : undefined
        }))
        .filter((p) => p.x !== undefined && p.x !== null);

      return {
        chartType: chartTypeCustom,
        xLabel: getLabel(xVarCustom, activeDataset),
        yLabel: yVarCustom ? getLabel(yVarCustom, activeDataset) : undefined,
        title: 'Custom Workspace Plot',
        data: pts
      };
    }

    if (availablePlots.length === 0) return null;
    return availablePlots[activeGraphIndex] || availablePlots[0];
  }, [
    isCrossDataset,
    useCustomBuilder,
    activeGraphIndex,
    availablePlots,
    crossPlotData,
    xVarCustom,
    yVarCustom,
    zVarCustom,
    colorByCustom,
    chartTypeCustom,
    scientificRecords,
    activeDataset,
    activeDataset2
  ]);

  // Set default custom builder axes when dataset changes
  useEffect(() => {
    if (activeDataset && activeDataset.variables.length > 0) {
      const numVars = activeDataset.variables.filter((v) => v.is_numeric);
      if (numVars.length > 0) {
        setXVarCustom(numVars[0].sql_column_name);
        if (numVars.length > 1) {
          setYVarCustom(numVars[1].sql_column_name);
        } else {
          setYVarCustom('');
        }
      } else {
        setXVarCustom(activeDataset.variables[0].sql_column_name);
        setYVarCustom('');
      }
      setColorByCustom('');
      setZVarCustom('');
      setActiveGraphIndex(0);
    }
  }, [selectedDatasetId]);

  // Saved Workspaces config handlers
  const handleSaveWorkspace = () => {
    if (!newChartName.trim() || !selectedDatasetId) return;

    const newSaved: SavedChart = {
      id: Date.now().toString(),
      name: newChartName,
      selectedLab: getLabNameForModule(activeDataset?.module || 'geochemistry'),
      isCrossDataset,
      selectedDatasetId,
      selectedDatasetId2,
      xVar: xVarCustom,
      yVar: yVarCustom,
      zVar: zVarCustom,
      colorBy: colorByCustom,
      chartType: chartTypeCustom,
      filters,
      multiFilters,
      activeGraphIndex
    };

    const updated = [...savedCharts, newSaved];
    setSavedCharts(updated);
    localStorage.setItem('ongc_lims_saved_charts', JSON.stringify(updated));
    setNewChartName('');
    setShowSaveModal(false);
  };

  const handleLoadWorkspace = (chart: SavedChart) => {
    setSelectedDatasetId(chart.selectedDatasetId);
    setSelectedDatasetId2(chart.selectedDatasetId2);
    setIsCrossDataset(chart.isCrossDataset);
    setXVarCustom(chart.xVar);
    setYVarCustom(chart.yVar);
    setZVarCustom(chart.zVar);
    setColorByCustom(chart.colorBy);
    setChartTypeCustom(chart.chartType);
    setFilters(chart.filters || {});
    setMultiFilters(chart.multiFilters || {});
    setActiveGraphIndex(chart.activeGraphIndex !== undefined ? chart.activeGraphIndex : 0);
    setUseCustomBuilder(chart.xVar !== '' && !chart.isCrossDataset);
  };

  const handleDeleteSavedChart = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedCharts.filter((c) => c.id !== id);
    setSavedCharts(updated);
    localStorage.setItem('ongc_lims_saved_charts', JSON.stringify(updated));
  };

  const handleResetFilters = () => {
    setFilters({});
    setMultiFilters({});
    setFilterSearches({});
  };

  const toggleMultiSelect = (key: string, option: string) => {
    setMultiFilters((prev) => {
      const current = prev[key] || [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [key]: next };
    });
  };

  // Find dynamic list of compatible cross-dataset candidates
  const crossDatasetCandidates = React.useMemo(() => {
    if (!datasets || !selectedDatasetId) return [];
    return datasets.filter((d) => d.id !== selectedDatasetId);
  }, [datasets, selectedDatasetId]);

  return (
    <div className="space-y-6">
      
      {/* Datasets Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dynamic Workspace</h2>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowSaveModal(true)}
            variant="outline"
            className="py-1 px-2.5 text-xs text-slate-500 hover:text-slate-700 bg-white flex items-center"
            disabled={!selectedDatasetId}
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            Save Workspace
          </Button>
          <Button
            onClick={handleResetFilters}
            variant="outline"
            className="py-1 px-2.5 text-xs text-slate-500 hover:text-slate-700 bg-white flex items-center"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Reset Filters
          </Button>
        </div>
      </div>

      {/* ── SAVED CHARTS QUICK BAR ── */}
      {savedCharts.length > 0 && (
        <Card className="border-slate-200 shadow-xs p-4 bg-slate-50/50">
          <div className="flex items-center gap-2 mb-3">
            <FolderHeart className="w-4 h-4 text-ongc-orange" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Saved Workspaces</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {savedCharts.map((chart) => (
              <div
                key={chart.id}
                onClick={() => handleLoadWorkspace(chart)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-350 cursor-pointer text-xs font-semibold text-slate-700 transition-all shadow-3xs"
              >
                <span>{chart.name}</span>
                <span className="text-[9px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 uppercase">
                  {chart.isCrossDataset ? 'Cross' : 'Single'}
                </span>
                <button
                  onClick={(e) => handleDeleteSavedChart(chart.id, e)}
                  className="p-0.5 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Trash className="w-3.5 h-3.5 text-slate-450" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── PRIMARY DATASET & CONFIG CONTROL ── */}
      <Card className="border-slate-200/90 shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          
          {/* Dataset Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Select Target Dataset
            </label>
            {datasetsLoading ? (
              <div className="h-10 flex items-center pl-3 bg-slate-50 rounded-xl border border-slate-200">
                <Spinner size="sm" />
                <span className="text-xs text-slate-450 ml-2">Loading registry...</span>
              </div>
            ) : (
              <select
                value={selectedDatasetId || ''}
                onChange={(e) => handleDatasetChange(parseInt(e.target.value))}
                className="w-full text-sm font-semibold rounded-xl border-slate-250 bg-white py-2.5 px-3.5 focus:ring-2 focus:ring-ongc-blue focus:border-ongc-blue shadow-3xs"
              >
                {datasets?.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.display_name} ({getLabNameForModule(ds.module).replace(' Laboratory', '')})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Graph Selection (Scientific Default Graphs) */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Approved Default Graphs
            </label>
            <div className="flex flex-wrap gap-2">
              {availablePlots.map((plot: any, idx: number) => {
                const isActive = !isCrossDataset && !useCustomBuilder && activeGraphIndex === idx;
                return (
                  <button
                    key={plot.id || idx}
                    onClick={() => {
                      setIsCrossDataset(false);
                      setUseCustomBuilder(false);
                      setActiveGraphIndex(idx);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                      isActive
                        ? 'bg-ongc-blue border-ongc-blue text-white shadow-md'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    {plot.title}
                  </button>
                );
              })}
              {availablePlots.length === 0 && (
                <span className="text-xs text-slate-400 italic py-2">No pre-configured scientific plots for this dataset</span>
              )}
            </div>
          </div>

        </div>
      </Card>

      {/* ── COLLAPSIBLE FILTERS PANEL ── */}
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
            {/* Loading Indicator */}
            {metadataLoading && (
              <div className="col-span-full py-4 flex items-center justify-center">
                <Spinner size="sm" />
                <span className="text-xs text-slate-450 ml-2">Discovering filterable fields...</span>
              </div>
            )}

            {/* Numeric filters dynamically generated */}
            {activeDataset?.variables
              ?.filter((v) => v.is_filterable && v.is_numeric)
              ?.map((v) => {
                const range = metadata?.filter_ranges?.[v.sql_column_name] || { min: 0, max: 100 };
                const minKey = `${v.sql_column_name}_min`;
                const maxKey = `${v.sql_column_name}_max`;
                return (
                  <div key={v.sql_column_name} className="space-y-1.5 p-2.5 bg-white border border-slate-100 rounded-xl shadow-3xs">
                    <label className="block text-[10px] font-extrabold text-slate-650 uppercase tracking-wide">
                      {v.display_name} {v.display_unit ? `(${v.display_unit})` : ''}
                    </label>
                    <div className="flex gap-2">
                      <div className="w-1/2">
                        <label className="text-[9px] text-slate-455 block font-semibold">Min Bound</label>
                        <input
                          type="number"
                          placeholder={range.min.toFixed(1)}
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
                        <label className="text-[9px] text-slate-455 block font-semibold">Max Bound</label>
                        <input
                          type="number"
                          placeholder={range.max.toFixed(1)}
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

            {/* Categorical filters dynamically generated */}
            {activeDataset?.variables
              ?.filter((v) => v.is_filterable && !v.is_numeric)
              ?.map((v) => {
                const options = metadata?.filter_options?.[v.sql_column_name] || [];
                const searchKey = v.sql_column_name;
                const searchVal = filterSearches[searchKey] || '';
                const checkedOpts = multiFilters[searchKey] || [];

                const filteredOpts = options.filter((opt: string) =>
                  opt.toLowerCase().includes(searchVal.toLowerCase())
                );

                return (
                  <div key={v.sql_column_name} className="space-y-1.5 p-2.5 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col h-40">
                    <label className="block text-[10px] font-extrabold text-slate-655 uppercase tracking-wide">
                      {v.display_name}
                    </label>
                    {options.length > 5 && (
                      <div className="relative shrink-0">
                        <input
                          type="text"
                          placeholder={`Search...`}
                          value={searchVal}
                          onChange={(e) =>
                            setFilterSearches((prev) => ({ ...prev, [searchKey]: e.target.value }))
                          }
                          className="w-full text-[11px] rounded-lg border-slate-250 bg-slate-50/50 py-1 pl-6 pr-2 focus:ring-1 focus:ring-ongc-blue"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1.5" />
                      </div>
                    )}
                    <div className="overflow-y-auto space-y-1.5 pt-1 pl-1 flex-1">
                      {filteredOpts.length === 0 ? (
                        <div className="text-[10px] text-slate-400 italic">No options matched</div>
                      ) : (
                        filteredOpts.map((opt: string) => {
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
        )}
      </Card>

      {/* Dataset Records Table (Default Collapsed at Top) */}
      <DashboardDatasetTable
        title={`${activeDataset?.display_name || 'Dynamic Dataset'} Records`}
        data={scientificRecords || []}
        variables={activeDataset?.variables}
        isLoading={recordsLoading}
      />

      {/* ── SCIENTIFIC VISUALIZATION PLOT ── */}
      <Card noPadding className="border-slate-200/90 shadow-md min-h-[480px]">
        {recordsLoading || (isCrossDataset && crossPlotLoading) ? (
          <div className="h-120 flex flex-col items-center justify-center gap-3">
            <Spinner size="lg" />
            <span className="text-sm font-semibold text-slate-500">Querying and plotting data coordinates...</span>
          </div>
        ) : isCrossDataset && isCrossPlotError ? (
          <div className="h-120 flex flex-col items-center justify-center gap-3 p-6 text-center select-none">
            <span className="p-4 rounded-full bg-red-50 text-red-500 border border-red-100 shadow-3xs">
              <AlertCircle className="w-8 h-8" />
            </span>
            <h3 className="text-base font-bold text-slate-700 mt-2">Correlation Analysis Unavailable</h3>
            <p className="text-xs text-slate-400 max-w-md leading-relaxed">
              {crossPlotError?.message || 'No common relational identifiers (e.g. BOREHOLE_ID, UBHI, DEPTH) could be established between these datasets to enable correlation plotting.'}
            </p>
          </div>
        ) : plotToRender ? (
          <div className="p-6">
            <div className="border-b border-slate-100 pb-3 mb-5 flex justify-center text-center">
              <div className="inline-block border border-slate-200/80 px-4 py-1.5 rounded-lg bg-slate-50/50 shadow-2xs">
                <h3 className="text-base font-bold text-slate-800 uppercase tracking-wider text-center">
                  {plotToRender.title}
                </h3>
              </div>
            </div>
            <div className="h-[500px]">
              <DynamicPlotlyChart
                chartType={plotToRender.chartType}
                data={plotToRender.data}
                xLabel={plotToRender.xLabel}
                yLabel={plotToRender.yLabel}
                colorByLabel={colorByCustom || undefined}
                title=""
              />
            </div>
          </div>
        ) : (
          <div className="h-120 flex flex-col items-center justify-center p-6 text-slate-400 italic">
            Select a default graph above or open Advanced Analysis to customize variables.
          </div>
        )}
      </Card>

      {/* ── ADVANCED ANALYSIS PANEL (COLLAPSIBLE, PLACED AT THE BOTTOM) ── */}
      <Card className="border-slate-200/90 shadow-sm bg-slate-50/30">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowAdvanced(!showAdvanced)}>
          <div className="flex items-center gap-2">
            <Sliders className="w-4.5 h-4.5 text-slate-500" />
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">Advanced Analysis</h3>
          </div>
          <span className="text-xs font-bold text-slate-400 hover:text-slate-650 select-none">
            {showAdvanced ? 'Hide Options ▴' : 'Expand Options ▾'}
          </span>
        </div>

        {showAdvanced && (
          <div className="mt-5 pt-5 border-t border-slate-200/60 space-y-6 animate-slide-down">
            
            {/* Toggles */}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsCrossDataset(false);
                  setUseCustomBuilder(true);
                }}
                className={`px-4 py-2 border rounded-xl text-xs font-bold transition-all ${
                  useCustomBuilder && !isCrossDataset
                    ? 'bg-ongc-blue border-ongc-blue text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Free-form Chart Builder
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCrossDataset(true);
                  setUseCustomBuilder(false);
                }}
                className={`px-4 py-2 border rounded-xl text-xs font-bold transition-all ${
                  isCrossDataset
                    ? 'bg-amber-50 border-amber-350 text-amber-700 hover:bg-amber-100'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Cross-Dataset Correlation Plot
              </button>
            </div>

            {/* Custom variable selections */}
            {(useCustomBuilder || isCrossDataset) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-white border border-slate-200/60 rounded-2xl">
                
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">1. Axes Parameters</h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        {isCrossDataset ? 'Variable A (X)' : 'X Variable'}
                      </label>
                      <select
                        value={xVarCustom}
                        onChange={(e) => setXVarCustom(e.target.value)}
                        className="w-full text-xs font-semibold rounded-lg border-slate-250 bg-white py-2 px-3 focus:ring-1 focus:ring-ongc-blue"
                      >
                        <option value="">Select variable</option>
                        {activeDataset?.variables.map((v) => (
                          <option key={v.id} value={v.sql_column_name}>
                            {v.display_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        {isCrossDataset ? 'Variable B (Y)' : 'Y Variable'}
                      </label>
                      <select
                        value={yVarCustom}
                        onChange={(e) => setYVarCustom(e.target.value)}
                        className="w-full text-xs font-semibold rounded-lg border-slate-250 bg-white py-2 px-3 focus:ring-1 focus:ring-ongc-blue"
                      >
                        <option value="">Select variable</option>
                        {(isCrossDataset ? activeDataset2 : activeDataset)?.variables?.map((v) => (
                          <option key={v.id} value={v.sql_column_name}>
                            {v.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">2. Dataset & Type</h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {isCrossDataset ? (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Dataset B</label>
                        <select
                          value={selectedDatasetId2 || ''}
                          onChange={(e) => setSelectedDatasetId2(e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full text-xs font-semibold rounded-lg border-slate-250 bg-white py-2 px-3 focus:ring-1 focus:ring-ongc-blue"
                        >
                          <option value="">Select Dataset B</option>
                          {crossDatasetCandidates.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.display_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Color / Series By</label>
                        <select
                          value={colorByCustom}
                          onChange={(e) => setColorByCustom(e.target.value)}
                          className="w-full text-xs font-semibold rounded-lg border-slate-250 bg-white py-2 px-3 focus:ring-1 focus:ring-ongc-blue"
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
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Chart Type</label>
                      <select
                        value={chartTypeCustom}
                        onChange={(e) => setChartTypeCustom(e.target.value)}
                        className="w-full text-xs font-semibold rounded-lg border-slate-250 bg-white py-2 px-3 focus:ring-1 focus:ring-ongc-blue"
                      >
                        <option value="scatter">Scatter Plot</option>
                        <option value="line">Line Plot</option>
                        <option value="bar">Bar Chart</option>
                        <option value="histogram">Histogram</option>
                        <option value="boxplot">Box Plot</option>
                        <option value="depth_profile">Depth Profile</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">3. Relational Diagnostics</h4>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-[11px] text-slate-500 h-20 overflow-y-auto">
                    {isCrossDataset ? (
                      crossPlotData && crossPlotData.length > 0 ? (
                        <div className="space-y-1">
                          <span className="text-emerald-600 font-bold">✓ Join Success</span>
                          <div>Common data points: {crossPlotData.length}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No points joined. Choose compatible datasets.</span>
                      )
                    ) : (
                      <span>Free-form customization active for {activeDataset?.display_name}.</span>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── SAVE WORKSPACE MODAL ── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <Card className="max-w-md w-full border-slate-200 shadow-2xl">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-bold text-slate-800">Save Workspace</h3>
              <p className="text-[10px] text-slate-400">Save current filters and active graph parameters</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Workspace Name</label>
                <input
                  type="text"
                  placeholder="e.g. TOC Core vs Cutting Plot"
                  value={newChartName}
                  onChange={(e) => setNewChartName(e.target.value)}
                  className="w-full text-xs font-semibold rounded-lg border-slate-250 py-2 px-3 focus:ring-2 focus:ring-ongc-blue"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowSaveModal(false)}
                  className="text-xs border-slate-200 text-slate-650 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveWorkspace}
                  disabled={!newChartName.trim()}
                  className="text-xs bg-ongc-blue text-white hover:bg-ongc-blueDark"
                >
                  Save
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
};
