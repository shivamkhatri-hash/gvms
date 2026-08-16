import api from './api';
import { SampleListResponse, PetroleumSample, DashboardStats, UploadStats, UploadLog, AuditLog, SystemHealth } from '../types';

export const samplesService = {
  async getSamples(params: any): Promise<SampleListResponse> {
    const response = await api.get<SampleListResponse>('/samples', { params });
    return response.data;
  },

  async getSampleById(id: number): Promise<PetroleumSample> {
    const response = await api.get<PetroleumSample>(`/samples/${id}`);
    return response.data;
  },

  async createSample(sampleData: any): Promise<PetroleumSample> {
    const response = await api.post<PetroleumSample>('/samples', sampleData);
    return response.data;
  },

  async deleteSample(id: number) {
    const response = await api.delete(`/samples/${id}`);
    return response.data;
  },

  async getDashboardStats(params?: any): Promise<any> {
    const response = await api.get<any>('/dashboard', { params });
    return response.data;
  },

  async getDashboardChartData(params: any): Promise<any> {
    const response = await api.get<any>('/dashboard/chart-data', { params });
    return response.data;
  },

  async uploadFile(file: File): Promise<UploadStats> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<UploadStats>('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async getUploadLogs(): Promise<UploadLog[]> {
    const response = await api.get<UploadLog[]>('/upload/logs');
    return response.data;
  },

  async getHealthStatus(): Promise<SystemHealth> {
    const response = await api.get<SystemHealth>('/health');
    return response.data;
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    const response = await api.get<AuditLog[]>('/audit-logs');
    return response.data;
  },

  async getMetabaseEmbedUrl(dataset?: string): Promise<{ url: string }> {
    const response = await api.get<{ url: string }>('/dashboard/embed-url', {
      params: dataset ? { dataset } : {}
    });
    return response.data;
  },
};
