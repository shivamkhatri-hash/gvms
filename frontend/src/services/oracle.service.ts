import api from './api';

export interface OracleRegion {
  code: string;
  name: string;
  location: string;
  user: string;
  description: string;
  is_active: boolean;
}

export interface OracleRegionStatus {
  current_region: string;
  current_user: string;
  current_host: string;
  current_port: string;
  current_service_name: string;
  database_provider: string;
  regions: OracleRegion[];
}

export interface SwitchRegionResponse {
  success: boolean;
  region: string;
  region_name: string;
  location: string;
  user: string;
  service_name: string;
  message: string;
}

export const oracleService = {
  async getRegions(): Promise<OracleRegionStatus> {
    const response = await api.get<OracleRegionStatus>('/oracle/regions');
    return response.data;
  },

  async switchRegion(region: string): Promise<SwitchRegionResponse> {
    const response = await api.post<SwitchRegionResponse>('/oracle/switch-region', { region });
    return response.data;
  },

  async getLiveStatus(): Promise<any> {
    const response = await api.get<any>('/oracle/status');
    return response.data;
  }
};
