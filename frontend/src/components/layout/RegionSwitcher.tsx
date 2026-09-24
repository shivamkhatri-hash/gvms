import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Loader2, Globe } from 'lucide-react';
import { oracleService, OracleRegionStatus, OracleRegion } from '../../services/oracle.service';

const REGION_CODES = ['NR', 'ER', 'SR', 'MR', 'WR', 'CR'];

export const RegionSwitcher: React.FC = () => {
  const [regionStatus, setRegionStatus] = useState<OracleRegionStatus | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    try {
      const data = await oracleService.getRegions();
      setRegionStatus(data);
    } catch (err) {
      console.warn('Could not fetch Oracle regional configuration:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectRegion = async (code: string) => {
    if (activeCode === code || isSwitching) return;

    setIsSwitching(code);
    setErrorMsg(null);

    try {
      await oracleService.switchRegion(code);
      await fetchStatus();
      setIsOpen(false);
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to switch region.');
    } finally {
      setIsSwitching(null);
    }
  };

  const activeCode = regionStatus?.current_region || 'NR';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-2xs ${
          isOpen
            ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-100'
            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
        }`}
      >
        <Globe className="w-3.5 h-3.5 text-blue-600" />
        <span>{activeCode}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </button>

      {/* Simple Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          {errorMsg && (
            <div className="px-3 py-1.5 text-[11px] text-rose-600 bg-rose-50 border-b border-rose-100">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col">
            {REGION_CODES.map((code) => {
              const isActive = activeCode === code;
              const switching = isSwitching === code;

              return (
                <button
                  key={code}
                  type="button"
                  disabled={isActive || isSwitching !== null}
                  onClick={() => handleSelectRegion(code)}
                  className={`w-full px-3 py-2 text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 cursor-default'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{code}</span>
                  {switching ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                  ) : isActive ? (
                    <Check className="w-3.5 h-3.5 text-blue-600" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
