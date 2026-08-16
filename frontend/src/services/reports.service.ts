import api from './api';

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
};
