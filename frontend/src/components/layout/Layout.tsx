import React, { useState } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryLab = searchParams.get('lab');

  const getBreadcrumbName = (pathname: string) => {
    const path = pathname.replace(/^\/(oil|isotope|biomarker|surface)/, '');
    switch (path) {
      case '':
      case '/':
      case '/dashboard':
      case '/composition-dashboard':
      case '/sterane-dashboard':
      case '/hopane-dashboard':
      case '/tricyclic-dashboard':
      case '/aromatic-dashboard':
      case '/pr-ph-dashboard':
        return 'Dashboard';

      case '/metabase':
        return 'Metabase BI';
      case '/reports':
        return 'Reports';
      case '/settings':
        return 'System Settings';
      case '/users':
        return 'User Management';
      case '/logs':
        return 'Audit Logs';
      case '/dynamic-dashboard':
        return 'Geochem Analytics';
      default:
        return 'Dashboard';
    }
  };

  const getLabContext = (pathname: string, queryLabVal: string | null) => {
    let labKey = queryLabVal || '';
    if (!labKey) {
      if (pathname.startsWith('/oil')) labKey = 'oil';
      else if (pathname.startsWith('/isotope')) labKey = 'isotope';
      else if (pathname.startsWith('/biomarker')) labKey = 'biomarker';
      else if (pathname.startsWith('/surface')) labKey = 'surface';
    }

    if (labKey === 'oil') {
      return {
        name: 'Oil Laboratory',
        emoji: '🛢️',
        subtitle: 'Oil Chemistry & Composition Laboratory Information Management System'
      };
    }
    if (labKey === 'isotope') {
      return {
        name: 'Stable Isotope Laboratory',
        emoji: '🔬',
        subtitle: 'Stable Isotope Geochemistry Laboratory Information Management System'
      };
    }
    if (labKey === 'biomarker') {
      return {
        name: 'Biomarker Laboratory',
        emoji: '🧬',
        subtitle: 'Molecular Biomarker Geochemistry Laboratory Information Management System'
      };
    }
    if (labKey === 'surface') {
      return {
        name: 'Surface Geochemistry / MBER / Microbiology / BioEnergy Laboratory',
        emoji: '🧫',
        subtitle: 'Surface Geochemistry & Geomicrobiology Laboratory Information Management System'
      };
    }
    if (pathname.startsWith('/dynamic-dashboard')) {
      return {
        name: 'GEOCHEM / DYNAMIC DASHBOARD',
        emoji: '📊',
        subtitle: 'Global Geochemical Analysis & Interactive Interpretation Platform'
      };
    }


    const isGlobalTab = [
      '/reports', 
      '/metabase', 
      '/users', 
      '/logs', 
      '/settings'
    ].some(path => pathname.startsWith(path));

    if (isGlobalTab) {
      return {
        name: 'GVMS',
        emoji: '🔥',
        subtitle: 'Graphical Visualization Management System'
      };
    }

    if (labKey === 'geochemistry' || pathname === '/' || pathname.startsWith('/dashboard') || !labKey) {
      return {
        name: 'Source Rock Laboratory',
        emoji: '🧪',
        subtitle: 'Petroleum Geochemistry Laboratory Information Management System'
      };
    }

    return {
      name: 'Source Rock Laboratory',
      emoji: '🧪',
      subtitle: 'Petroleum Geochemistry Laboratory Information Management System'
    };
  };

  const lab = getLabContext(location.pathname, queryLab);
  const isMetabase = location.pathname.endsWith('/metabase');

  return (
    <div className="h-screen bg-ongc-bg flex overflow-hidden">
      {/* Sidebar navigation */}
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      {/* Main content wrapper */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 h-full">
        <Header setSidebarOpen={setSidebarOpen} />
        <div className={`flex-1 ${isMetabase ? 'overflow-hidden flex flex-col' : 'overflow-y-auto scrollbar-thin'}`}>
          <main className={`w-full mx-auto ${
            isMetabase 
              ? 'p-4 sm:p-6 max-w-none flex-1 flex flex-col gap-4 min-h-0' 
              : 'p-4 sm:p-6 lg:p-8 max-w-7xl space-y-6'
          }`}>
            {/* Dynamic Breadcrumbs & Unified Page Header */}
            <div className="border-b border-slate-200 pb-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 select-none mb-1.5">
                <span>{lab.name}</span>
                <span className="text-slate-300 font-normal">&gt;</span>
                <span className="text-slate-700 font-bold">{getBreadcrumbName(location.pathname)}</span>
              </div>
              
              <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <span>{lab.emoji} {lab.name}</span>
              </h1>
              <p className="text-[10px] text-slate-405 font-bold uppercase tracking-wider mt-0.5">
                {lab.subtitle}
              </p>
            </div>

            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};
