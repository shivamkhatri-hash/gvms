import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Activity, User, Globe } from 'lucide-react';
import { samplesService } from '../services/samples.service';
import { Card } from '../components/common/Card';
import { Spinner } from '../components/common/Spinner';
import { formatDate } from '../utils/formatters';

export const Logs: React.FC = () => {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: samplesService.getAuditLogs,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">System Audit Activity Logs</h1>
        <p className="text-xs text-slate-500 mt-1">
          Security audit trail recording user logins, data ingestion pipelines, and user administration events
        </p>
      </div>

      <Card noPadding>
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Resource</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(logs || []).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{log.user_email}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono">{log.resource}</td>
                    <td className="py-3 px-4 text-slate-700 max-w-xs truncate">{log.details || '—'}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono">{log.ip_address || '127.0.0.1'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
