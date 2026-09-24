import React, { useState, useEffect } from 'react';
import { Menu, LogOut, Activity, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { samplesService } from '../../services/samples.service';
import { RegionSwitcher } from './RegionSwitcher';

interface HeaderProps {
  setSidebarOpen: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ setSidebarOpen }) => {
  const { user, logout } = useAuth();
  const [health, setHealth] = useState<'healthy' | 'degraded' | 'unhealthy' | 'checking'>('checking');

  useEffect(() => {
    samplesService
      .getHealthStatus()
      .then((data) => setHealth(data.status))
      .catch(() => setHealth('degraded'));
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between shadow-2xs">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span className="text-ongc-blue font-bold">Oil & Natural Gas Corporation</span>
          <span>/</span>
          <span>GVMS</span>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Oracle Region / User Switcher */}
        <RegionSwitcher />

        {/* Health status badge */}
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              health === 'healthy' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          />
          <span className="text-slate-600 font-medium text-[11px]">
            {health === 'healthy' ? 'System Normal' : 'Degraded'}
          </span>
        </div>

        {/* User profile dropdown trigger */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-800">{user?.full_name}</p>
            <p className="text-[10px] text-slate-500">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            title="Log Out"
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

