export type Role = 'admin' | 'researcher' | 'viewer';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PetroleumSample {
  id: number;
  well_name: string;
  sample_type: string;
  depth_from: number;
  depth_interval: number;
  toc: number;
  s2: number;
  toc_classification: 'Poor' | 'Fair' | 'Good' | 'Very Good' | 'Excellent';
  s2_classification: 'Poor' | 'Fair' | 'Good' | 'Very Good' | 'Excellent';
  interpretation?: string;
  created_at: string;
  uploaded_by?: string;
}

export interface SampleFilterState {
  well_name: string;
  sample_type: string;
  depth_min?: number;
  depth_max?: number;
  toc_min?: number;
  toc_max?: number;
  s2_min?: number;
  s2_max?: number;
  page: number;
  limit: number;
}

export interface SampleListResponse {
  total: number;
  items: PetroleumSample[];
  wells: string[];
  sample_types: string[];
}

export interface DashboardStats {
  total_samples: number;
  total_wells: number;
  avg_toc: number;
  avg_s2: number;
  max_toc: number;
  max_s2: number;
  toc_distribution: Record<string, number>;
  s2_distribution: Record<string, number>;
  wells_summary: Array<{
    well_name: string;
    samples_count: number;
    avg_toc: number;
    avg_s2: number;
    min_depth: number;
    max_depth: number;
  }>;
}

export interface UploadStats {
  filename: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  duplicates: number;
  warnings: string[];
  message: string;
  dataset_name?: string;
  rows_imported?: number;
  rows_updated?: number;
  rows_skipped?: number;
  measured_variables?: string[];
  calculated_variables?: string[];
  missing_optional_variables?: string[];
  execution_time?: number;
  validation_summary?: string;
  records?: any[];
  quality_report?: any;
}

export interface UploadLog {
  id: number;
  filename: string;
  file_size: number;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_summary?: string;
  quality_report?: string;
  uploaded_at: string;
  uploaded_by?: string;
}

export interface AuditLog {
  id: number;
  user_id?: string;
  user_email: string;
  action: string;
  resource: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    backend: string;
    database: string;
    metabase: string;
  };
  metabase: {
    status: string;
    url: string;
    version?: string;
    healthy: boolean;
    error?: string;
  };
}
