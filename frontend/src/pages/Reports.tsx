import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, FileSpreadsheet, FileCode, Filter } from 'lucide-react';
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
}

interface ReportsProps {
  module?: string;
}

export const Reports: React.FC<ReportsProps> = ({ module = 'geochemistry' }) => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [format, setFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [wellName, setWellName] = useState<string>('ALL');
  const [sampleType, setSampleType] = useState<string>('ALL');
  const [depthMin, setDepthMin] = useState<string>('');
  const [depthMax, setDepthMax] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // 1. Fetch Registered Datasets
  const { data: datasets, isLoading: datasetsLoading } = useQuery<DatasetDef[]>({
    queryKey: ['datasets'],
    queryFn: () => api.get<DatasetDef[]>('/datasets').then((res) => res.data),
  });

  const filteredDatasets = React.useMemo(() => {
    return datasets?.filter((d) => d.module === module) || [];
  }, [datasets, module]);

  const activeDataset = filteredDatasets?.find((d) => d.id === selectedDatasetId);

  // Default to first dataset ID
  useEffect(() => {
    if (filteredDatasets && filteredDatasets.length > 0 && selectedDatasetId === null) {
      setSelectedDatasetId(filteredDatasets[0].id);
    }
  }, [filteredDatasets, selectedDatasetId]);

  // Reset filters when dataset changes
  useEffect(() => {
    setWellName('ALL');
    setSampleType('ALL');
    setDepthMin('');
    setDepthMax('');
  }, [selectedDatasetId]);

  // 2. Fetch Dataset-Specific Metadata for filter options
  const { data: metadata, isLoading: metaLoading } = useQuery({
    queryKey: ['metadata', selectedDatasetId],
    queryFn: () =>
      api.get<{ wells: string[]; sample_types: string[] }>('/metadata', {
        params: { dataset_id: selectedDatasetId },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  const wells = metadata?.wells || [];
  const sampleTypes = metadata?.sample_types || [];

  const handleDownload = async () => {
    if (!selectedDatasetId) return;
    setIsDownloading(true);
    try {
      const filters: any = {};
      if (wellName !== 'ALL') filters.well_name = wellName;
      if (sampleType !== 'ALL') filters.sample_type = sampleType;
      if (depthMin) filters.depth_min = parseFloat(depthMin);
      if (depthMax) filters.depth_max = parseFloat(depthMax);

      await reportsService.downloadReport(format, selectedDatasetId, filters);
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
            {module === 'oil' ? 'Oil Technical Reports' : 'Dynamic Technical Reports'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Export executive summary reports, raw sample datasets, and structured spreadsheets.
          </p>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Target Dataset</label>
          <select
            value={selectedDatasetId || ''}
            onChange={(e) => setSelectedDatasetId(Number(e.target.value))}
            className="w-full text-xs font-semibold rounded-lg border-slate-200 bg-slate-50/50 py-2 px-3 text-slate-700 focus:ring-2 focus:ring-ongc-blue"
          >
            {filteredDatasets?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name}
              </option>
            ))}
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
          <p className="text-xs text-slate-500 mt-1">Formatted GVMS lab report with executive summary, tables, and statistics.</p>
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

      {/* Action Download Card */}
      <Card title="Export Filtered Dataset">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {activeDataset?.primary_well_column && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Filter by Well</label>
                <select
                  value={wellName}
                  onChange={(e) => setWellName(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-200 bg-white py-2 px-3 focus:ring-2 focus:ring-ongc-blue"
                >
                  <option value="ALL">All Wells ({wells.length})</option>
                  {wells.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeDataset?.variables?.some((v) => v.sql_column_name === 'sample_type' || v.sql_column_name === 'LITHOLOGY') && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Filter by Lithology</label>
                <select
                  value={sampleType}
                  onChange={(e) => setSampleType(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-200 bg-white py-2 px-3 focus:ring-2 focus:ring-ongc-blue"
                >
                  <option value="ALL">All Lithologies ({sampleTypes.length})</option>
                  {sampleTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeDataset?.primary_well_column && (
              <>
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
              </>
            )}
          </div>

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
