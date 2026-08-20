import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await login(email, password, rememberMe);
      navigate('/');
    } catch (err: any) {
      setError(
        err.response?.data?.detail || 'Authentication failed. Please verify your credentials.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillDemoUser = (roleEmail: string, rolePass: string) => {
    setEmail(roleEmail);
    setPassword(rolePass);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-ongc-blueDark via-ongc-blue to-slate-900 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-premium overflow-hidden border border-slate-100">
        {/* Header Branding */}
        <div className="bg-gradient-to-r from-ongc-blue to-ongc-blueDark p-8 text-center text-white relative">
          <div className="w-14 h-14 bg-gradient-to-tr from-ongc-orange to-amber-400 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg ring-4 ring-white/10">
            <Flame className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">OIL AND NATURAL GAS CORPORATION</h1>
          <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest mt-1">
            GVMS - Graphical Visualization Management System
          </p>
        </div>

        {/* Login Form */}
        <div className="p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Account Sign In</h2>
          <p className="text-xs text-slate-500 mb-6">Access laboratory datasets & analytical dashboards</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="admin@ongc.co.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="w-4 h-4" />}
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
              required
            />

            <div className="flex items-center justify-between py-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-ongc-blue focus:ring-ongc-blue w-4 h-4"
                />
                <span className="text-xs font-medium text-slate-600">Remember me on this device</span>
              </label>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Session security
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={isSubmitting}
            >
              Sign In to GVMS Portal
            </Button>
          </form>

          {/* Preset Roles Quick Fill */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 text-center">
              Quick Connect Roles
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => fillDemoUser('admin@ongc.co.in', 'Admin@123456')}
                className="px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => fillDemoUser('researcher@ongc.co.in', 'Researcher@123')}
                className="px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Researcher
              </button>
              <button
                type="button"
                onClick={() => fillDemoUser('viewer@ongc.co.in', 'Viewer@123')}
                className="px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Viewer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
