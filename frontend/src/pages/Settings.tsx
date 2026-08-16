import React, { useState } from 'react';
import { User, Lock, Server, CheckCircle, Database } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/auth.service';
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">System Settings & Profile</h1>
        <p className="text-xs text-slate-500 mt-1">Manage personal security, access keys, and view database status</p>
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
            <div className="mt-2">
              <span className={`inline-flex px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-md border ${roleBadge.color}`}>
                {roleBadge.label}
              </span>
            </div>
          </div>
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

      {/* Infrastructure Node Info */}
      <Card title="System & Infrastructure Status">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-slate-400 font-semibold uppercase text-[10px]">Database Node</p>
            <p className="font-bold text-slate-800 mt-1">PostgreSQL 16 (ongc_lab)</p>
            <p className="text-emerald-600 font-medium text-[11px] mt-1">● Healthy (Port 5432)</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-slate-400 font-semibold uppercase text-[10px]">API Server</p>
            <p className="font-bold text-slate-800 mt-1">FastAPI Python 3.11</p>
            <p className="text-emerald-600 font-medium text-[11px] mt-1">● Healthy (Port 8000)</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-slate-400 font-semibold uppercase text-[10px]">BI Analytics Engine</p>
            <p className="font-bold text-slate-800 mt-1">Metabase Platform</p>
            <p className="text-emerald-600 font-medium text-[11px] mt-1">● Connected (Port 3001)</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
