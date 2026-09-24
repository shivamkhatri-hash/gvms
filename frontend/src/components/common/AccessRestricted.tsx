import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Lock, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from './Button';
import { getFirstAccessibleRoute } from '../../utils/rbac';

interface AccessRestrictedProps {
  labName?: string;
  moduleName?: string;
}

export const AccessRestricted: React.FC<AccessRestrictedProps> = ({
  labName = 'Laboratory Module',
  moduleName,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const assignedTasks = user?.assigned_tasks || [];
  const accessibleRoute = getFirstAccessibleRoute(user);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 text-white text-center relative">
          <div className="w-16 h-16 bg-red-500/15 border-2 border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Lock className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">Laboratory Access Restricted</h2>
          <p className="text-xs text-slate-300 mt-1">
            Role-Based Access Control (RBAC) Enforcement
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold block mb-1">
              Permission Required for: <span className="text-amber-800 font-bold">{labName}</span> {moduleName ? `(${moduleName})` : ''}
            </span>
            Your user account is not currently assigned to this laboratory domain. Please contact your system administrator to request access.
          </div>

          {/* User Details Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Logged-in User:</span>
              <span className="font-semibold text-slate-800">{user?.full_name || user?.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Assigned Role:</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-800 uppercase">
                {user?.role || 'Viewer'}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200">
              <span className="text-slate-500 font-medium block mb-1.5">Your Accessible Laboratory Tasks:</span>
              {assignedTasks.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {assignedTasks.map((task, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold"
                    >
                      <UserCheck className="w-3 h-3 text-emerald-600" />
                      {task}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-slate-400 italic text-[11px]">Core Lab (Default)</span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <Button
              variant="primary"
              className="flex-1 justify-center"
              icon={<ArrowRight className="w-4 h-4" />}
              onClick={() => navigate(accessibleRoute)}
            >
              Go to Accessible Lab
            </Button>
            <Button
              variant="outline"
              className="justify-center"
              onClick={() => window.history.back()}
            >
              Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
