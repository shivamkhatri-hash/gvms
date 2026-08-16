import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Database } from 'lucide-react';
import { Card } from './Card';

interface Variable {
  sql_column_name: string;
  display_name: string;
  is_numeric?: boolean;
}

interface DashboardDatasetTableProps {
  title: string;
  data: any[];
  variables?: Variable[];
  isLoading?: boolean;
}

export const DashboardDatasetTable: React.FC<DashboardDatasetTableProps> = ({
  title,
  data,
  variables,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const rowCount = data?.length || 0;

  // Resolve headers dynamically
  const columns = React.useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Core keys we always want to show first if present
    const coreKeysMap: Record<string, string> = {
      well_name: 'Well Name',
      name: 'Well Name',
      well: 'Well Name',
      depth_top: 'Depth (m)',
      depth_from: 'Depth (m)',
      depth: 'Depth (m)',
      sample_top: 'Depth (m)',
      top_depth: 'Depth (m)',
      sample_type: 'Sample Type',
      lithology: 'Lithology',
      formation: 'Formation',
      layer_name: 'Layer Name',
    };

    const firstRecord = data[0];
    const recordKeys = Object.keys(firstRecord);

    const resolved: { key: string; label: string }[] = [];
    const addedKeys = new Set<string>();

    // 1. Add core keys first in order
    Object.entries(coreKeysMap).forEach(([k, label]) => {
      // Find matching key in record (case-insensitive)
      const match = recordKeys.find(rk => rk.toLowerCase() === k.toLowerCase());
      if (match && !addedKeys.has(match)) {
        resolved.push({ key: match, label });
        addedKeys.add(match);
      }
    });

    // 2. Add variables mapped from VariableRegistry
    if (variables && variables.length > 0) {
      variables.forEach(v => {
        const match = recordKeys.find(rk => rk.toLowerCase() === v.sql_column_name.toLowerCase());
        if (match && !addedKeys.has(match)) {
          resolved.push({ key: match, label: v.display_name });
          addedKeys.add(match);
        }
      });
    }

    // 3. Add any leftover keys except internal ones
    const excludedKeys = new Set([
      'id', 'dataset_id', 'created_at', 'updated_at', 'well_id', 'version_id', 'active_version_id', 'color_by'
    ]);
    recordKeys.forEach(k => {
      if (!addedKeys.has(k) && !excludedKeys.has(k.toLowerCase()) && !k.startsWith('Unnamed')) {
        // Format key to start-case label
        const label = k
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        resolved.push({ key: k, label });
        addedKeys.add(k);
      }
    });

    return resolved;
  }, [data, variables]);

  return (
    <Card className="border border-slate-200 shadow-sm overflow-hidden flex flex-col w-full rounded-2xl bg-white mb-6" noPadding>
      {/* Collapsible Header Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition-colors border-b border-slate-100 focus:outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
            <Database className="w-4 h-4" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              {title}
              <span className="px-2 py-0.5 text-[10px] font-semibold text-slate-500 bg-slate-200/60 rounded-full">
                {rowCount} {rowCount === 1 ? 'record' : 'records'}
              </span>
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Filtered database records matching current sidebar selections (click to expand)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-[11px] font-medium hidden sm:inline">
            {isOpen ? 'Click to collapse' : 'Click to expand'}
          </span>
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded Table Section */}
      {isOpen && (
        <div className="p-5">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-sky-600 border-t-transparent" />
              <span>Loading dataset records...</span>
            </div>
          ) : rowCount === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm italic">
              No matching dataset records found for the current filter selections.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs max-h-[400px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
                  <tr className="text-slate-600 font-bold uppercase tracking-wider">
                    {columns.map(col => (
                      <th key={col.key} className="p-3 whitespace-nowrap bg-slate-50 border-r border-slate-200/60 last:border-r-0">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {data.map((row, idx) => (
                    <tr key={row.id || idx} className="hover:bg-slate-50/50 transition-colors odd:bg-slate-50/10">
                      {columns.map(col => {
                        const val = row[col.key];
                        const displayVal = val === null || val === undefined ? (
                          <span className="text-slate-400 italic">N/A</span>
                        ) : typeof val === 'number' ? (
                          val.toFixed(4).replace(/\.?0+$/, '') // clean decimals
                        ) : (
                          String(val)
                        );
                        return (
                          <td key={col.key} className="p-3 border-r border-slate-100/60 last:border-r-0 whitespace-nowrap">
                            {displayVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
