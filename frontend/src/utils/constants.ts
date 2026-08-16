export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const TOC_COLORS: Record<string, string> = {
  Poor: '#EF4444',      // Red
  Fair: '#F59E0B',      // Amber
  Good: '#10B981',      // Emerald Green
  'Very Good': '#06B6D4', // Cyan
  Excellent: '#8B5CF6'  // Purple
};

export const S2_COLORS: Record<string, string> = {
  Poor: '#EF4444',
  Fair: '#F59E0B',
  Good: '#10B981',
  'Very Good': '#06B6D4',
  Excellent: '#8B5CF6'
};

export const ROLE_BADGES: Record<string, { label: string; color: string }> = {
  admin: { label: 'Administrator', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  researcher: { label: 'Researcher', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  viewer: { label: 'Viewer', color: 'bg-slate-100 text-slate-700 border-slate-200' }
};
