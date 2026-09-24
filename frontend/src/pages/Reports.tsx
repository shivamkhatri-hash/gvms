import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, FileSpreadsheet, FileCode, CheckSquare, Square, Search } from 'lucide-react';
import { reportsService } from '../services/reports.service';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import api from '../services/api';

interface DatasetDef {
  id: number;
  name: string;
  display_name: string;
  module: string;
  primary_well_column: string | null;
  variables: any[];
  graph_config?: any[];
}

interface ReportsProps {
  module?: string;
}

export const Reports: React.FC<ReportsProps> = ({ module = 'all' }) => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [format, setFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  
  // Multi-select filters state
  const [selectedWells, setSelectedWells] = useState<string[]>([]);
  const [selectedSampleTypes, setSelectedSampleTypes] = useState<string[]>([]);
  const [wellSearch, setWellSearch] = useState<string>('');
  const [sampleTypeSearch, setSampleTypeSearch] = useState<string>('');
  
  const [depthMin, setDepthMin] = useState<string>('');
  const [depthMax, setDepthMax] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [selectedGraphs, setSelectedGraphs] = useState<string[]>([]);

  // 1. Fetch Registered Datasets
  const { data: datasets, isLoading: datasetsLoading } = useQuery<DatasetDef[]>({
    queryKey: ['datasets'],
    queryFn: () => api.get<DatasetDef[]>('/datasets').then((res) => res.data),
  });

  const filteredDatasets = useMemo(() => {
    if (module === 'all') return datasets || [];
    return datasets?.filter((d) => d.module === module) || [];
  }, [datasets, module]);

  const activeDataset = filteredDatasets?.find((d) => d.id === selectedDatasetId);

  // Default to first dataset ID
  useEffect(() => {
    if (filteredDatasets && filteredDatasets.length > 0 && selectedDatasetId === null) {
      setSelectedDatasetId(filteredDatasets[0].id);
    }
  }, [filteredDatasets, selectedDatasetId]);

  // 2. Fetch Dataset-Specific Metadata for filter options
  const { data: metadata, isLoading: metaLoading } = useQuery({
    queryKey: ['metadata', selectedDatasetId],
    queryFn: () =>
      api.get<{ wells: string[]; sample_types: string[]; filter_options?: Record<string, string[]> }>('/metadata', {
        params: { dataset_id: selectedDatasetId },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  const wells = useMemo(() => {
    return metadata?.wells || metadata?.filter_options?.well_name || metadata?.filter_options?.name || [];
  }, [metadata]);

  const sampleTypes = useMemo(() => {
    return metadata?.sample_types || metadata?.filter_options?.sample_type || metadata?.filter_options?.lithology || metadata?.filter_options?.formation || [];
  }, [metadata]);

  // Reset filters and select all by default when dataset changes
  useEffect(() => {
    setSelectedWells([]);
    setSelectedSampleTypes([]);
    setDepthMin('');
    setDepthMax('');
    setSelectedGraphs([]);
  }, [selectedDatasetId]);

  // Determine available graphs for active dataset
  const availableGraphs = useMemo(() => {
    if (activeDataset?.graph_config && activeDataset.graph_config.length > 0) {
      return activeDataset.graph_config;
    }
    const ds_name = activeDataset?.name?.toLowerCase() || '';
    if (ds_name.includes('hopane')) {
      return [
        { type: 'oleanane_vs_bicadinane', title: 'Oleanane vs Bicadinane Index Crossplot' },
        { type: 'diahopane_vs_bnh', title: 'Diahopane vs Bisnorhopane Index Crossplot' },
        { type: 'c29ts_vs_oleanane', title: 'C29Ts/(C29H+C29Ts) vs Oleanane Index Crossplot' },
        { type: 'hopane_depth_profiles', title: 'C31 Homohopane 22S/(22S+22R) Depth Profile' }
      ];
    } else if (ds_name.includes('sterane')) {
      return [
        { type: 'sterane_c29_maturity', title: 'Sterane C29 20S/(20S+20R) vs ββ/(αα+ββ) Maturity Plot' },
        { type: 'sterane_crossplot', title: 'C27R/(C27R+C29R) Sterane Crossplot' },
        { type: 'sterane_diast_c27_c29', title: 'C27/C29 Diasterane Ratio vs Depth' }
      ];
    } else if (ds_name.includes('aromatic')) {
      return [
        { type: 'aromatic_vrc_depth', title: 'Calculated Vitrinite Reflectance (%VRo) vs Depth' },
        { type: 'aromatic_mpi_depth', title: 'Methylphenanthrene Index (MPI-1) vs Depth' },
        { type: 'aromatic_dbt_phe_vs_pr_ph', title: 'DBT/PHE vs Pr/Ph Crossplot' }
      ];
    } else if (ds_name.includes('pr_ph') || ds_name.includes('pristane')) {
      return [
        { type: 'pr_nc17_vs_ph_nc18', title: 'Pristane/nC17 vs Phytane/nC18 Depositional Crossplot' },
        { type: 'pr_ph_profile', title: 'Pr/Ph Ratio Subsurface Depth Profile' }
      ];
    } else if (ds_name.includes('tricyclic')) {
      return [
        { type: 'tricyclic_crossplot', title: 'C23/C21 vs C24/C23 Tricyclic Terpane Crossplot' },
        { type: 'etr_depth_profile', title: 'Extended Tricyclic Ratio (ETR) vs Depth' }
      ];
    } else if (ds_name.includes('gas_isotope') || ds_name.includes('isotope')) {
      return [
        { type: 'sofer_plot', title: 'Sofer Isotopic δ13C Saturates vs Aromatics Plot' },
        { type: 'bernard_diagram', title: 'Bernard Natural Gas Genetic Classification Diagram' },
        { type: 'csia_profile', title: 'CSIA δ13C n-Alkanes Subsurface Profile' }
      ];
    } else if (ds_name.includes('oil')) {
      return [
        { type: 'api_vs_depth', title: 'Crude Oil API Gravity vs Depth Profile' },
        { type: 'oleanane_vs_bicadinane', title: 'Oleanane vs Bicadinane Biomarker Crossplot' }
      ];
    } else {
      return [
        { type: 's2_vs_toc', title: 'Pyrolysis S2 vs Total Organic Carbon (TOC) Crossplot' },
        { type: 'hi_vs_tmax', title: 'Modified Van Krevelen HI vs Tmax Maturity Diagram' },
        { type: 'depth_profile', title: 'TOC Source Rock Richness vs Depth Profile' }
      ];
    }
  }, [activeDataset]);

  // Multi-select helpers
  const filteredWells = useMemo(() => {
    if (!wellSearch.trim()) return wells;
    return wells.filter((w) => w.toLowerCase().includes(wellSearch.toLowerCase()));
  }, [wells, wellSearch]);

  const filteredSampleTypes = useMemo(() => {
    if (!sampleTypeSearch.trim()) return sampleTypes;
    return sampleTypes.filter((t) => t.toLowerCase().includes(sampleTypeSearch.toLowerCase()));
  }, [sampleTypes, sampleTypeSearch]);

  const toggleWell = (w: string) => {
    setSelectedWells((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]));
  };

  const toggleSampleType = (t: string) => {
    setSelectedSampleTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const sampleTypeVar = activeDataset?.variables?.find(
    (v) => v.sql_column_name.toLowerCase() === 'sample_type' || v.sql_column_name.toLowerCase() === 'lithology' || v.sql_column_name.toLowerCase() === 'formation'
  );

  const handleDownload = async () => {
    if (!selectedDatasetId) return;
    setIsDownloading(true);
    try {
      const filters: any = {};
      if (selectedWells.length > 0) {
        filters.well_name = selectedWells.join(',');
      }
      if (selectedSampleTypes.length > 0) {
        filters.sample_type = selectedSampleTypes.join(',');
      }
      if (depthMin) filters.depth_min = parseFloat(depthMin);
      if (depthMax) filters.depth_max = parseFloat(depthMax);
      if (format === 'pdf' && selectedGraphs.length > 0) {
        filters.include_graphs = selectedGraphs.join(',');
      }

      if (format === 'pdf') {
        await reportsService.downloadReportWithSnapshots(selectedDatasetId, filters);
      } else {
        await reportsService.downloadReport(format, selectedDatasetId, filters);
      }
    } catch (err) {
      alert('Report generation failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (datasetsLoading || (selectedDatasetId && metaLoading)) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {module === 'all' ? 'Global Technical Reports' : (module === 'oil' ? 'Oil Technical Reports' : 'Dynamic Technical Reports')}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Export executive summary reports, high-resolution lab graph snapshots, raw sample datasets, and structured spreadsheets.
          </p>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Target Dataset</label>
          <select
            value={selectedDatasetId || ''}
            onChange={(e) => setSelectedDatasetId(Number(e.target.value))}
            className="w-full text-xs font-semibold rounded-lg border-slate-200 bg-slate-50/50 py-2 px-3 text-slate-700 focus:ring-2 focus:ring-ongc-blue"
          >
            {module === 'all' ? (
              ['geochemistry', 'oil', 'isotope', 'biomarker', 'surface', 'inorganic'].map((mod) => {
                const modDatasets = filteredDatasets.filter((d) => d.module === mod);
                if (modDatasets.length === 0) return null;
                const labels: Record<string, string> = {
                  geochemistry: 'Source Rock Geochemistry',
                  oil: 'Oil Laboratory',
                  isotope: 'Stable Isotope Laboratory',
                  biomarker: 'Biomarker Laboratory',
                  surface: 'Surface Geochemistry / MBER',
                  inorganic: 'Inorganic / Water Analysis',
                };
                return (
                  <optgroup key={mod} label={labels[mod] || mod.toUpperCase()}>
                    {modDatasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.display_name}
                      </option>
                    ))}
                  </optgroup>
                );
              })
            ) : (
              filteredDatasets?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.display_name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Report Format Selection Cards */}
        <div
          onClick={() => setFormat('pdf')}
          className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-200 bg-white ${
            format === 'pdf' ? 'border-ongc-blue shadow-md ring-2 ring-ongc-blue/10' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">PDF Technical Executive Report</h3>
          <p className="text-xs text-slate-500 mt-1">Formatted GVMS lab report with high-res scientific graph snapshots, executive summary, tables, and statistics.</p>
        </div>

        <div
          onClick={() => setFormat('excel')}
          className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-200 bg-white ${
            format === 'excel' ? 'border-ongc-blue shadow-md ring-2 ring-ongc-blue/10' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Excel Workbook (.xlsx)</h3>
          <p className="text-xs text-slate-500 mt-1">Multi-tab styled Excel file with column auto-fit and cell formatting.</p>
        </div>

        <div
          onClick={() => setFormat('csv')}
          className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-200 bg-white ${
            format === 'csv' ? 'border-ongc-blue shadow-md ring-2 ring-ongc-blue/10' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-ongc-blue flex items-center justify-center mb-4">
            <FileCode className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Raw Data CSV (.csv)</h3>
          <p className="text-xs text-slate-500 mt-1">Standard comma-separated dataset for external petroleum software integration.</p>
        </div>
      </div>

      {/* Multi-Select Filters & Configuration Card */}
      <Card title="Multi-Select Filters & Report Scope">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Multi-select Wells */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Filter by Wells ({selectedWells.length === 0 ? 'All Selected' : `${selectedWells.length} Selected`})
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedWells(wells)}
                    className="text-[10px] font-semibold text-ongc-blue hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedWells([])}
                    className="text-[10px] font-semibold text-slate-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search wells..."
                  value={wellSearch}
                  onChange={(e) => setWellSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-ongc-blue"
                />
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1 bg-white p-2 border border-slate-200 rounded-lg">
                {filteredWells.length === 0 ? (
                  <p className="text-xs text-slate-400 py-1 text-center">No wells found</p>
                ) : (
                  filteredWells.map((w) => {
                    const isChecked = selectedWells.includes(w);
                    return (
                      <label
                        key={w}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer text-xs select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleWell(w)}
                          className="rounded text-ongc-blue focus:ring-ongc-blue h-3.5 w-3.5"
                        />
                        <span className={isChecked ? 'font-semibold text-ongc-blue' : 'text-slate-700'}>{w}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Multi-select Sample Types / Formations */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Filter by {sampleTypeVar?.display_name || 'Lithology / Formation'} ({selectedSampleTypes.length === 0 ? 'All Selected' : `${selectedSampleTypes.length} Selected`})
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSampleTypes(sampleTypes)}
                    className="text-[10px] font-semibold text-ongc-blue hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedSampleTypes([])}
                    className="text-[10px] font-semibold text-slate-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search types / formations..."
                  value={sampleTypeSearch}
                  onChange={(e) => setSampleTypeSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-ongc-blue"
                />
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1 bg-white p-2 border border-slate-200 rounded-lg">
                {filteredSampleTypes.length === 0 ? (
                  <p className="text-xs text-slate-400 py-1 text-center">No categories found</p>
                ) : (
                  filteredSampleTypes.map((t) => {
                    const isChecked = selectedSampleTypes.includes(t);
                    return (
                      <label
                        key={t}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer text-xs select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSampleType(t)}
                          className="rounded text-ongc-blue focus:ring-ongc-blue h-3.5 w-3.5"
                        />
                        <span className={isChecked ? 'font-semibold text-ongc-blue' : 'text-slate-700'}>{t}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Depth Range Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Depth From (m)</label>
              <input
                type="number"
                placeholder="e.g. 1000"
                value={depthMin}
                onChange={(e) => setDepthMin(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-200 bg-white py-2 px-3 focus:ring-2 focus:ring-ongc-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Depth To (m)</label>
              <input
                type="number"
                placeholder="e.g. 3500"
                value={depthMax}
                onChange={(e) => setDepthMax(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-200 bg-white py-2 px-3 focus:ring-2 focus:ring-ongc-blue"
              />
            </div>
          </div>
 
          {/* Selectable Graphs Section (PDF format only) */}
          {format === 'pdf' && availableGraphs.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Include Laboratory Graph Snapshots in PDF Report</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Select the high-resolution crossplots, maturity diagrams, and depth profiles to embed into the executive document.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedGraphs(availableGraphs.map((g: any) => g.type))}
                    className="text-[10px] font-semibold text-ongc-blue hover:underline"
                  >
                    Select All Graphs
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedGraphs([])}
                    className="text-[10px] font-semibold text-slate-500 hover:underline"
                  >
                    Default Graphs
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {availableGraphs.map((g: any) => {
                  const isChecked = selectedGraphs.includes(g.type);
                  return (
                    <label
                      key={g.type}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer select-none transition-all duration-150 ${
                        isChecked 
                          ? 'border-ongc-blue bg-blue-50/10 shadow-xs' 
                          : 'border-slate-100 hover:border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedGraphs(selectedGraphs.filter(type => type !== g.type));
                          } else {
                            setSelectedGraphs([...selectedGraphs, g.type]);
                          }
                        }}
                        className="mt-0.5 rounded text-ongc-blue focus:ring-ongc-blue h-3.5 w-3.5"
                      />
                      <div>
                        <span className="block text-xs font-bold text-slate-700 leading-tight">{g.title}</span>
                        <span className="block text-[9px] text-slate-400 uppercase font-semibold tracking-wider mt-1">{g.type.replace(/_/g, ' ')}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Excel/CSV Tooltip warning */}
          {format !== 'pdf' && (
            <div className="pt-4 border-t border-slate-100">
              <div className="text-[10px] text-slate-400 italic font-semibold flex items-center gap-1.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span>ℹ️</span>
                <span>Visualizations and interpretation plots are only available for PDF Technical Executive Reports. Excel and CSV export raw tabular structures directly.</span>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <Button
              variant="primary"
              size="lg"
              icon={<Download className="w-4 h-4" />}
              isLoading={isDownloading}
              onClick={handleDownload}
            >
              Download {format.toUpperCase()} Technical Report
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
