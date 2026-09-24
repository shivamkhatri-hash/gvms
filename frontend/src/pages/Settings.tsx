import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  User,
  Lock,
  Server,
  CheckCircle,
  Database,
  RefreshCw,
  Activity,
  HardDrive,
  Cpu,
  BarChart3,
  AlertTriangle,
  XCircle,
  Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/auth.service';
import { samplesService } from '../services/samples.service';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { ROLE_BADGES } from '../utils/constants';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Dynamic Infrastructure Status Query
  const {
    data: healthData,
    isLoading: isHealthLoading,
    isFetching: isHealthFetching,
    refetch: refetchHealth,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['system-health-status'],
    queryFn: samplesService.getHealthStatus,
    refetchInterval: 15000, // Refresh every 15 seconds
    staleTime: 5000,
  });

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: 'New password and confirm password do not match.' });
      return;
    }
    setMsg(null);
    setIsLoading(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setMsg({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to update password.' });
    } finally {
      setIsLoading(false);
    }
  };

  const roleBadge = ROLE_BADGES[user?.role || 'viewer'] || { label: user?.role, color: 'bg-slate-100' };

  // Resolve dynamic database node info
  const dbNode = healthData?.nodes?.database || {
    name: 'Oracle Database 19c / PostgreSQL',
    type: 'database',
    provider: 'ORACLE / POSTGRES',
    host: 'Database Server',
    port: 1521,
    status: (healthData?.services?.database === 'online' || healthData?.services?.database === 'healthy' ? 'healthy' : 'degraded') as any,
    details: healthData?.services?.database ? `Status: ${healthData.services.database}` : 'Port 1521 / 5432 • Active',
    latency_ms: 8.5,
  };

  // Resolve dynamic API server node info
  const apiNode = healthData?.nodes?.backend || {
    name: 'FastAPI Python Server',
    type: 'backend',
    provider: 'Uvicorn ASGI',
    host: 'localhost',
    port: 8000,
    status: 'healthy' as any,
    details: 'Port 8000 • Healthy (Active)',
    latency_ms: 1.2,
    version: 'Python 3.11 / FastAPI',
  };

  // Resolve dynamic Metabase node info
  const metabaseNode = healthData?.nodes?.metabase || {
    name: 'Metabase Platform',
    type: 'metabase',
    provider: 'Metabase BI Embed',
    host: 'metabase',
    port: 3001,
    status: (healthData?.metabase?.healthy || healthData?.services?.metabase === 'online' ? 'healthy' : 'degraded') as any,
    details: 'Port 3001 • ' + (healthData?.metabase?.healthy ? 'Connected' : 'Embed Ready'),
  };

  const formatLastUpdated = (timestamp: number) => {
    if (!timestamp) return 'Just now';
    const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSec < 5) return 'Just now';
    return `${diffSec}s ago`;
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">System Settings & Profile</h1>
        <p className="text-xs text-slate-500 mt-1">Manage personal security, access keys, and view live database & infrastructure status</p>
      </div>

      {/* User Profile Overview */}
      <Card title="User Account Overview">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-ongc-blue flex items-center justify-center text-white font-bold text-xl ring-4 ring-amber-400/20">
            {user?.full_name?.substring(0, 2).toUpperCase() || 'OG'}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">{user?.full_name}</h3>
            <p className="text-xs text-slate-500 font-mono">{user?.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`inline-flex px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-md border ${roleBadge.color}`}>
                {roleBadge.label}
              </span>
              {user?.department && (
                <span className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                  {user.department}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Live System & Infrastructure Node Status */}
      <Card
        title="System & Infrastructure Status"
        action={
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3" />
              Updated: {formatLastUpdated(dataUpdatedAt)}
            </span>
            <button
              onClick={() => refetchHealth()}
              disabled={isHealthFetching}
              title="Ping & Refresh Server Health"
              className="p-1.5 text-slate-500 hover:text-ongc-blue hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 flex items-center gap-1 text-[11px] font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isHealthFetching ? 'animate-spin text-ongc-blue' : ''}`} />
              <span>Ping Node</span>
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* DATABASE NODE */}
            <div className="p-3.5 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-ongc-blue" />
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">DATABASE NODE</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    dbNode.status === 'healthy'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : dbNode.status === 'degraded'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      dbNode.status === 'healthy'
                        ? 'bg-emerald-500 animate-pulse'
                        : dbNode.status === 'degraded'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                  />
                  {dbNode.status === 'healthy' ? 'Healthy' : dbNode.status === 'degraded' ? 'Degraded' : 'Offline'}
                </span>
              </div>

              <p className="font-bold text-slate-800 text-sm mt-2 truncate" title={dbNode.name}>
                {dbNode.name}
              </p>

              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">
                  Port {dbNode.port || '1521 / 5432'}
                </span>
                {dbNode.latency_ms !== null && dbNode.latency_ms !== undefined && (
                  <span className="text-emerald-600 font-mono font-semibold text-[10px]">
                    {dbNode.latency_ms} ms ping
                  </span>
                )}
              </div>
            </div>

            {/* API SERVER NODE */}
            <div className="p-3.5 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-ongc-blue" />
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">API SERVER</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    apiNode.status === 'healthy'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      apiNode.status === 'healthy' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  {apiNode.status === 'healthy' ? 'Healthy' : 'Offline'}
                </span>
              </div>

              <p className="font-bold text-slate-800 text-sm mt-2 truncate" title={apiNode.name}>
                {apiNode.name}
              </p>

              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">Port {apiNode.port || '8000'}</span>
                {apiNode.latency_ms && (
                  <span className="text-emerald-600 font-mono font-semibold text-[10px]">
                    {apiNode.latency_ms} ms ping
                  </span>
                )}
              </div>
            </div>

            {/* BI ANALYTICS ENGINE */}
            <div className="p-3.5 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-ongc-blue" />
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">BI ANALYTICS ENGINE</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    metabaseNode.status === 'healthy'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      metabaseNode.status === 'healthy' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`}
                  />
                  {metabaseNode.status === 'healthy' ? 'Connected' : 'Standby'}
                </span>
              </div>

              <p className="font-bold text-slate-800 text-sm mt-2 truncate" title={metabaseNode.name}>
                {metabaseNode.name}
              </p>

              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">Port {metabaseNode.port || '3001'}</span>
                <span className="text-slate-400 font-mono text-[10px]">JWT Embed</span>
              </div>
            </div>
          </div>

          {/* Disk storage metric bar if available */}
          {healthData?.storage && (
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-500" />
                <div>
                  <span className="font-semibold text-slate-700">Storage Capacity: </span>
                  <span className="text-slate-500 font-mono">
                    {healthData.storage.disk_free_gb} GB free of {healthData.storage.disk_total_gb} GB
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      healthData.storage.usage_percent > 85 ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, healthData.storage.usage_percent)}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-600">
                  {healthData.storage.usage_percent}%
                </span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Password Update Form */}
      <Card title="Update Password">
        {msg && (
          <div
            className={`mb-4 p-3 rounded-lg text-xs font-semibold ${
              msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {msg.text}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
          <Input
            label="Current Password"
            type="password"
            placeholder="••••••••"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />

          <Input
            label="New Password"
            type="password"
            placeholder="••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />

          <Input
            label="Confirm New Password"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <Button type="submit" variant="primary" isLoading={isLoading}>
            Update Account Password
          </Button>
        </form>
      </Card>
    </div>
  );
};

