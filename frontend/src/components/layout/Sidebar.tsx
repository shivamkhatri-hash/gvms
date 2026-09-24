import React, { useState } from 'react';
import { NavLink, useSearchParams, useLocation } from 'react-router-dom';
import {
  Users,
  FileText,
  BarChart3,
  Settings,
  ShieldAlert,
  Flame,
  Lock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { laboratories } from '../../labs/registry';
import { hasLabAccess } from '../../utils/rbac';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const currentPath = location.pathname;
  const getScopingLabQuery = () => {
    if (currentPath.startsWith('/oil')) return 'oil';
    if (currentPath.startsWith('/isotope')) return 'isotope';
    if (currentPath.startsWith('/biomarker')) return 'biomarker';
    if (currentPath.startsWith('/surface')) return 'surface';
    if (currentPath === '/' || currentPath.startsWith('/dashboard')) return 'geochemistry';
    return '';
  };
  const activeLabQuery = getScopingLabQuery();

  const [openLaboratories, setOpenLaboratories] = useState<boolean>(true);
  const [openLabs, setOpenLabs] = useState<Record<string, boolean>>(() => {
    const scopingLab = getScopingLabQuery();
    return {
      'source-rock': scopingLab === 'geochemistry' || !scopingLab,
      'oil': scopingLab === 'oil',
      'isotope': scopingLab === 'isotope',
      'biomarker': scopingLab === 'biomarker',
      'igc': false,
      'surface': scopingLab === 'surface',
    };
  });

  React.useEffect(() => {
    if (activeLabQuery) {
      setOpenLabs((prev) => ({
        ...prev,
        [activeLabQuery]: true,
      }));
    }
  }, [activeLabQuery]);

  const toggleLab = (labId: string) => {
    setOpenLabs((prev) => ({
      ...prev,
      [labId]: !prev[labId],
    }));
  };

  const adminItems = [
    { label: 'User Management', path: '/users', icon: Users, roles: ['admin'] },
    { label: 'Audit Logs', path: '/logs', icon: ShieldAlert, roles: ['admin'] },
    { label: 'System Settings', path: '/settings', icon: Settings, roles: ['admin', 'researcher', 'viewer'] },
  ];

  const mainItems = [
    {
      label: 'GEOCHEM / DYNAMIC DASHBOARD',
      path: '/dynamic-dashboard',
      icon: BarChart3,
      iconClassName: 'text-slate-450',
      roles: ['admin', 'researcher', 'viewer'],
      labKey: 'analytics',
    },
    {
      label: 'Reports',
      path: '/reports',
      icon: FileText,
      iconClassName: 'text-slate-450',
      roles: ['admin', 'researcher', 'viewer'],
    },
    {
      label: 'Metabase BI',
      path: '/metabase',
      icon: BarChart3,
      iconClassName: 'text-slate-450',
      roles: ['admin', 'researcher'],
      labKey: 'analytics',
    },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-40 h-screen w-64 bg-ongc-blueDark text-white transform transition-transform duration-200 ease-in-out flex flex-col justify-between ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 border-r border-slate-800`}
      >
        {/* Header & Logo - Fixed */}
        <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-ongc-orange to-amber-400 flex items-center justify-center shadow-md">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-white">GVMS</h1>
            <p className="text-[10px] text-amber-400 uppercase font-semibold tracking-wider">Geochemistry Visualization</p>
          </div>
        </div>

        {/* Scrollable Navigation */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
          <div className="space-y-3">
            {/* Collapsible Laboratories Parent */}
            <div className="border-b border-slate-850 pb-2 mb-2">
              <button
                onClick={() => setOpenLaboratories(!openLaboratories)}
                className="w-full flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-white transition-colors py-1.5"
              >
                <span className="flex items-center gap-1.5">
                  <span>🏢</span>
                  <span>Laboratories</span>
                </span>
                <span className="text-[9px] text-slate-500 shrink-0 ml-1">
                  {openLaboratories ? '▼' : '►'}
                </span>
              </button>

              {openLaboratories && (
                <div className="mt-2 pl-2 space-y-2 border-l border-slate-850 animate-fade-in">
                  {laboratories.map((lab) => {
                    const isLabOpen = openLabs[lab.id];
                    const isLabAccessible = hasLabAccess(user, lab.id);

                    return (
                      <div key={lab.id} className="border-b border-slate-850/50 pb-2 last:border-b-0 last:pb-0">
                        <button
                          onClick={() => toggleLab(lab.id)}
                          className={`w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wider transition-colors py-1.5 ${
                            isLabAccessible
                              ? 'text-slate-405 hover:text-white'
                              : 'text-slate-500 hover:text-slate-400 opacity-80'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 flex-1 mr-1">
                            <span>{lab.emoji}</span>
                            <span className="text-left leading-tight truncate">{lab.name}</span>
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {!isLabAccessible && (
                              <span className="text-[8px] bg-red-950/50 text-red-300 border border-red-900/50 px-1.5 py-0.5 rounded uppercase font-semibold flex items-center gap-0.5">
                                <Lock className="w-2 h-2 text-red-400" />
                                Not Accessible
                              </span>
                            )}
                            <span className="text-[9px] text-slate-500 ml-1">
                              {isLabOpen ? '▼' : '►'}
                            </span>
                          </div>
                        </button>

                        {isLabOpen && (
                          <div className="mt-1 pl-2.5 space-y-1 border-l border-slate-800 animate-fade-in">
                            {lab.isComingSoon ? (
                              <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-amber-500/80 font-medium italic select-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 animate-pulse" />
                                Coming Soon
                              </div>
                            ) : (
                              lab.items
                                .filter((item) => user && item.roles.includes(user.role))
                                .map((item, idx) => {
                                  const Icon = item.icon;
                                  return (
                                    <NavLink
                                      key={`${item.label}-${idx}`}
                                      to={item.path}
                                      end={item.path === '/'}
                                      onClick={() => setIsOpen(false)}
                                      className={({ isActive }) =>
                                        `flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-150 ${
                                          isActive
                                            ? 'bg-slate-800 text-white font-bold'
                                            : isLabAccessible
                                            ? 'text-slate-450 hover:text-white'
                                            : 'text-slate-500 hover:text-slate-300 opacity-70'
                                        }`
                                      }
                                    >
                                      <div className="flex items-center gap-2 truncate">
                                        <Icon className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                                        <span className="truncate">{item.label}</span>
                                      </div>
                                      {!isLabAccessible && (
                                        <Lock className="w-2.5 h-2.5 text-amber-500/70 shrink-0 ml-1" />
                                      )}
                                    </NavLink>
                                  );
                                })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top-level static navigation items following Laboratories */}
            <div className="space-y-1.5 pt-2">
              {mainItems
                .filter((item) => user && item.roles.includes(user.role))
                .map((item, idx) => {
                  const Icon = item.icon;
                  const isItemAccessible = !item.labKey || hasLabAccess(user, item.labKey);

                  return (
                    <NavLink
                      key={`${item.label}-${idx}`}
                      to={item.path}
                      onClick={() => setIsOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                          isActive
                            ? 'bg-ongc-blue text-white shadow-xs font-bold'
                            : isItemAccessible
                            ? 'text-slate-350 hover:bg-slate-800 hover:text-white'
                            : 'text-slate-500 hover:bg-slate-850 hover:text-slate-400 opacity-75'
                        }`
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${item.iconClassName || 'text-slate-450'}`} />
                        <span>{item.label}</span>
                      </div>
                      {!isItemAccessible && (
                        <span className="text-[8px] bg-red-950/50 text-red-300 border border-red-900/50 px-1 py-0.5 rounded uppercase font-semibold flex items-center gap-0.5">
                          <Lock className="w-2 h-2 text-red-400" />
                          Locked
                        </span>
                      )}
                    </NavLink>
                  );
                })}
            </div>
          </div>
        </div>

          {/* Admin Management Section */}
          <div className="pt-2 border-t border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2 px-1">
              System Administration
            </span>
            <div className="space-y-1.5">
              {adminItems
                .filter((item) => user && item.roles.includes(user.role))
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                          isActive
                            ? 'bg-ongc-blue text-white shadow-xs font-bold'
                            : 'text-slate-350 hover:bg-slate-800 hover:text-white'
                        }`
                      }
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
            </div>
          </div>

        {/* User Footer Profile */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-ongc-blue flex items-center justify-center text-white font-bold text-xs ring-2 ring-amber-400/30">
              {user?.full_name?.substring(0, 2).toUpperCase() || 'OG'}
            </div>
            <div className="truncate flex-1">
              <p className="text-xs font-semibold text-white truncate">{user?.full_name}</p>
              <p className="text-[10px] text-amber-400 uppercase font-semibold tracking-wider truncate">
                Role: {user?.role}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
