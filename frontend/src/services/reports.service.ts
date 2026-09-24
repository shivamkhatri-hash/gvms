import api from './api';
import { captureAllPlotlySnapshots, GraphSnapshot } from '../utils/plotlySnapshot';

export const reportsService = {
  async downloadReport(format: 'pdf' | 'excel' | 'csv', datasetId: number, filters: any) {
    const response = await api.get('/reports', {
      params: { format, dataset_id: datasetId, ...filters },
      responseType: 'blob',
    });

    const mimeTypes = {
      pdf: 'application/pdf',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
    };

    const extensions = {
      pdf: 'pdf',
      excel: 'xlsx',
      csv: 'csv',
    };

    const blob = new Blob([response.data], { type: mimeTypes[format] });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GVMS_Geochem_Report.${extensions[format]}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async downloadReportWithSnapshots(datasetId: number, filters?: any, explicitSnapshots?: GraphSnapshot[]) {
    // 1. Capture direct Plotly snapshots from on-screen graphs if not explicitly passed
    let snapshots = explicitSnapshots;
    if (!snapshots || snapshots.length === 0) {
      snapshots = await captureAllPlotlySnapshots({ width: 1200, height: 750, scale: 2 });
    }

    // 2. Call backend snapshot PDF export endpoint
    const response = await api.post(
      '/reports/export-pdf',
      {
        dataset_id: datasetId,
        well_name: filters?.well_name,
        sample_type: filters?.sample_type,
        depth_min: filters?.depth_min,
        depth_max: filters?.depth_max,
        custom_filters: filters,
        snapshots: snapshots && snapshots.length > 0 ? snapshots : undefined,
      },
      {
        responseType: 'blob',
      }
    );

    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GVMS_Laboratory_Report.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
