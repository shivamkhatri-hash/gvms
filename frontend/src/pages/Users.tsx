import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users as UsersIcon,
  UserPlus,
  Trash2,
  Edit,
  Shield,
  ShieldCheck,
  FlaskConical,
  Eye,
  CheckCircle2,
  XCircle,
  Search,
  Check,
  Lock,
  Building,
  ListTodo,
  RefreshCw
} from 'lucide-react';
import { authService, UserCreatePayload, UserUpdatePayload } from '../services/auth.service';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { Spinner } from '../components/common/Spinner';
import { ROLE_BADGES } from '../utils/constants';
import { formatDate } from '../utils/formatters';
import { User, Role } from '../types';

const AVAILABLE_TASKS = [
  { id: 'source_rock', label: 'Core Lab' },
  { id: 'oil_gc', label: 'Oil Lab' },
  { id: 'biomarkers', label: 'Biomarker Lab' },
  { id: 'isotopes', label: 'Isotope Lab' },
  { id: 'surface_microbiology', label: 'Surface Lab' },
  { id: 'inorganic_igc', label: 'Inorganic Lab' },
  { id: 'metabase_analytics', label: 'Analytics' },
  { id: 'user_admin', label: 'Administration' },
];

export const Users: React.FC = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form states
  const [createFormData, setCreateFormData] = useState<UserCreatePayload>({
    email: '',
    full_name: '',
    password: '',
    role: 'researcher',
    department: 'Geochemistry Laboratory',
    assigned_tasks: ['Core Lab'],
    is_active: true,
  });

  const [editFormData, setEditFormData] = useState<UserUpdatePayload>({
    email: '',
    full_name: '',
    password: '',
    role: 'researcher',
    department: '',
    assigned_tasks: [],
    is_active: true,
  });

  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 4000);
  };

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: authService.getUsers,
  });

  const createMutation = useMutation({
    mutationFn: (data: UserCreatePayload) => authService.createUser(data),
    onSuccess: (newUser) => {
      setIsAddModalOpen(false);
      setCreateFormData({
        email: '',
        full_name: '',
        password: '',
        role: 'researcher',
        department: 'Geochemistry Laboratory',
        assigned_tasks: ['Core Lab'],
        is_active: true,
      });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showNotification(`User account created successfully for ${newUser.email} with ${newUser.role.toUpperCase()} role.`);
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to create user account');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdatePayload }) => authService.updateUser(id, data),
    onSuccess: (updated) => {
      setIsEditModalOpen(false);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showNotification(`User ${updated.email} updated to role ${updated.role.toUpperCase()} with ${updated.assigned_tasks?.length || 0} assigned tasks.`);
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to update user');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authService.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showNotification('User account deleted successfully.');
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to delete user');
    },
  });

  // Open Edit Modal
  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setEditFormData({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      department: user.department || '',
      assigned_tasks: user.assigned_tasks || [],
      is_active: user.is_active,
      password: '',
    });
    setIsEditModalOpen(true);
  };

  // Quick inline role change
  const handleQuickRoleChange = (user: User, newRole: Role) => {
    if (user.id === currentUser?.id && newRole !== 'admin') {
      if (!window.confirm('Warning: Demoting your own admin account will restrict your administrative access. Proceed?')) {
        return;
      }
    }
    updateMutation.mutate({
      id: user.id,
      data: { role: newRole },
    });
  };

  // Quick inline status toggle
  const handleQuickStatusToggle = (user: User) => {
    if (user.id === currentUser?.id) {
      alert('You cannot deactivate your own currently active session account.');
      return;
    }
    updateMutation.mutate({
      id: user.id,
      data: { is_active: !user.is_active },
    });
  };

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.department && u.department.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && u.is_active) ||
        (statusFilter === 'inactive' && !u.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === 'admin').length;
    const researchers = users.filter((u) => u.role === 'researcher').length;
    const viewers = users.filter((u) => u.role === 'viewer').length;
    const active = users.filter((u) => u.is_active).length;
    return { total, admins, researchers, viewers, active };
  }, [users]);

  const toggleTaskSelection = (taskList: string[], taskLabel: string): string[] => {
    if (taskList.includes(taskLabel)) {
      return taskList.filter((t) => t !== taskLabel);
    } else {
      return [...taskList, taskLabel];
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-ongc-blue/10 rounded-lg text-ongc-blue">
              <Shield className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">User Access & Role Management</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure Role-Based Access Control (RBAC), assign laboratory domain tasks, and manage security credentials.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['users'] });
              showNotification('Synchronizing user list with database...');
            }}
          >
            Sync Database
          </Button>
          <Button variant="primary" icon={<UserPlus className="w-4 h-4" />} onClick={() => setIsAddModalOpen(true)}>
            Create User Account
          </Button>
        </div>
      </div>

      {/* Action notification banner */}
      {actionMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{actionMessage}</span>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Users</span>
            <UsersIcon className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800">{stats.total}</span>
            <span className="text-[10px] text-emerald-600 font-medium">({stats.active} Active)</span>
          </div>
        </div>

        <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-200/60 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Administrators</span>
            <ShieldCheck className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-purple-900">{stats.admins}</span>
            <span className="text-[10px] text-purple-600 font-medium ml-2">Full Permissions</span>
          </div>
        </div>

        <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200/60 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Researchers</span>
            <FlaskConical className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-blue-900">{stats.researchers}</span>
            <span className="text-[10px] text-blue-600 font-medium ml-2">Lab & Analytics</span>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Viewers</span>
            <Eye className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-slate-800">{stats.viewers}</span>
            <span className="text-[10px] text-slate-500 font-medium ml-2">Read Only</span>
          </div>
        </div>

        <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200/60 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Security State</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="text-sm font-bold text-emerald-900">RBAC Active</span>
            <p className="text-[10px] text-emerald-700 mt-0.5">Session Protected</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card noPadding className="p-4 bg-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by user name, email, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-ongc-blue/30 focus:border-ongc-blue bg-slate-50/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  roleFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All Roles
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('admin')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  roleFilter === 'admin' ? 'bg-purple-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('researcher')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  roleFilter === 'researcher' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Researcher
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('viewer')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  roleFilter === 'viewer' ? 'bg-slate-700 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Viewer
              </button>
            </div>

            <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  statusFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('inactive')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  statusFilter === 'inactive' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Inactive
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Users Table */}
      <Card noPadding>
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <Spinner />
            <span className="text-xs text-slate-500">Loading user registry...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <UsersIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-700">No users match your filters</h3>
            <p className="text-xs text-slate-400 mt-1">Try changing your search term or role filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-4">User Details</th>
                  <th className="py-3.5 px-4">Role & RBAC</th>
                  <th className="py-3.5 px-4">Assigned Laboratory Tasks</th>
                  <th className="py-3.5 px-4">Account Status</th>
                  <th className="py-3.5 px-4">Created Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const roleBadge = ROLE_BADGES[u.role] || { label: u.role, color: 'bg-slate-100' };
                  const isCurrent = currentUser?.id === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs uppercase ${
                              u.role === 'admin'
                                ? 'bg-purple-100 text-purple-700'
                                : u.role === 'researcher'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {u.full_name ? u.full_name.charAt(0) : u.email.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <span>{u.full_name}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 text-[9px] font-bold uppercase rounded bg-ongc-blue/10 text-ongc-blue border border-ongc-blue/20">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 font-mono text-[11px]">{u.email}</div>
                            {u.department && (
                              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                <Building className="w-3 h-3 text-slate-300" />
                                {u.department}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1.5">
                          <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border w-fit ${roleBadge.color}`}>
                            {roleBadge.label}
                          </span>
                          {/* Quick Role Select */}
                          <select
                            value={u.role}
                            onChange={(e) => handleQuickRoleChange(u, e.target.value as Role)}
                            className="text-[11px] py-1 px-2 rounded border border-slate-200 bg-white text-slate-700 font-medium focus:ring-1 focus:ring-ongc-blue w-fit"
                          >
                            <option value="admin">Admin</option>
                            <option value="researcher">Researcher</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {(u.assigned_tasks && u.assigned_tasks.length > 0) ? (
                            u.assigned_tasks.map((task, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200"
                              >
                                {task}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Default role access</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleQuickStatusToggle(u)}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                            u.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {u.is_active ? 'Active' : 'Deactivated'}
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">{formatDate(u.created_at)}</td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEditClick(u)}
                            title="Edit User & Permissions"
                            className="p-1.5 text-slate-500 hover:text-ongc-blue hover:bg-slate-100 rounded-md transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          {!isCurrent && (
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete user account for ${u.email}?`)) {
                                  deleteMutation.mutate(u.id);
                                }
                              }}
                              title="Delete Account"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* CREATE USER MODAL */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Create New System Account">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(createFormData);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Full Name"
              placeholder="e.g. Dr. Rajesh Sharma"
              value={createFormData.full_name}
              onChange={(e) => setCreateFormData({ ...createFormData, full_name: e.target.value })}
              required
            />

            <Input
              label="Email Address"
              type="email"
              placeholder="rsharma@ongc.co.in"
              value={createFormData.email}
              onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Initial Password"
              type="password"
              placeholder="••••••••"
              value={createFormData.password}
              onChange={(e) => setCreateFormData({ ...createFormData, password: e.target.value })}
              required
            />

            <Input
              label="Department / Laboratory"
              placeholder="e.g. Biomarker Exploration Lab"
              value={createFormData.department}
              onChange={(e) => setCreateFormData({ ...createFormData, department: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Select Access Role & Capabilities
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div
                onClick={() => setCreateFormData({ ...createFormData, role: 'admin' })}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  createFormData.role === 'admin'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-purple-900">Administrator</span>
                  {createFormData.role === 'admin' && <Check className="w-3.5 h-3.5 text-purple-600" />}
                </div>
                <p className="text-[10px] text-slate-500">Full system access, user management, audit logs, and SQL schema control.</p>
              </div>

              <div
                onClick={() => setCreateFormData({ ...createFormData, role: 'researcher' })}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  createFormData.role === 'researcher'
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-blue-900">Researcher</span>
                  {createFormData.role === 'researcher' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </div>
                <p className="text-[10px] text-slate-500">All lab dashboards, cross-plots, data upload, Metabase queries & reports.</p>
              </div>

              <div
                onClick={() => setCreateFormData({ ...createFormData, role: 'viewer' })}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  createFormData.role === 'viewer'
                    ? 'border-slate-600 bg-slate-100 ring-2 ring-slate-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-slate-900">Viewer</span>
                  {createFormData.role === 'viewer' && <Check className="w-3.5 h-3.5 text-slate-600" />}
                </div>
                <p className="text-[10px] text-slate-500">Read-only exploration of geochemistry datasets and report views.</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Assign Laboratory Tasks & Scope
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/50">
              {AVAILABLE_TASKS.map((task) => {
                const isSelected = (createFormData.assigned_tasks || []).includes(task.label);
                return (
                  <label
                    key={task.id}
                    className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer text-[11px] border transition-colors ${
                      isSelected ? 'bg-white border-ongc-blue text-slate-800 shadow-2xs' : 'bg-transparent border-transparent text-slate-600 hover:bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() =>
                        setCreateFormData({
                          ...createFormData,
                          assigned_tasks: toggleTaskSelection(createFormData.assigned_tasks || [], task.label),
                        })
                      }
                      className="mt-0.5 rounded border-slate-300 text-ongc-blue focus:ring-ongc-blue"
                    />
                    <div>
                      <span className="font-semibold leading-tight block text-slate-800">{task.label}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={createMutation.isPending}>
              Create Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT USER / ROLE & TASKS MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingUser(null);
        }}
        title={`Edit User Permissions: ${editingUser?.email}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editingUser) {
              updateMutation.mutate({
                id: editingUser.id,
                data: editFormData,
              });
            }
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Full Name"
              value={editFormData.full_name || ''}
              onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
              required
            />

            <Input
              label="Department / Lab"
              value={editFormData.department || ''}
              onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Reset Password (leave blank to keep current)"
              type="password"
              placeholder="New password..."
              value={editFormData.password || ''}
              onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Account Status
              </label>
              <select
                value={editFormData.is_active ? 'true' : 'false'}
                onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.value === 'true' })}
                className="w-full text-xs rounded-lg border border-slate-200 bg-white py-2 px-3 focus:ring-2 focus:ring-ongc-blue"
              >
                <option value="true">Active (Normal Access)</option>
                <option value="false">Deactivated (Blocked)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Assigned Access Role
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div
                onClick={() => setEditFormData({ ...editFormData, role: 'admin' })}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  editFormData.role === 'admin'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-purple-900">Administrator</span>
                  {editFormData.role === 'admin' && <Check className="w-3.5 h-3.5 text-purple-600" />}
                </div>
                <p className="text-[10px] text-slate-500">Full system access, user management, audit logs, and settings.</p>
              </div>

              <div
                onClick={() => setEditFormData({ ...editFormData, role: 'researcher' })}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  editFormData.role === 'researcher'
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-blue-900">Researcher</span>
                  {editFormData.role === 'researcher' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </div>
                <p className="text-[10px] text-slate-500">All lab dashboards, cross-plots, data upload & Metabase.</p>
              </div>

              <div
                onClick={() => setEditFormData({ ...editFormData, role: 'viewer' })}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  editFormData.role === 'viewer'
                    ? 'border-slate-600 bg-slate-100 ring-2 ring-slate-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-slate-900">Viewer</span>
                  {editFormData.role === 'viewer' && <Check className="w-3.5 h-3.5 text-slate-600" />}
                </div>
                <p className="text-[10px] text-slate-500">Read-only exploration of geochemistry datasets and reports.</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Assigned Laboratory Tasks & Domain Responsibilities
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/50">
              {AVAILABLE_TASKS.map((task) => {
                const isSelected = (editFormData.assigned_tasks || []).includes(task.label);
                return (
                  <label
                    key={task.id}
                    className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer text-[11px] border transition-colors ${
                      isSelected ? 'bg-white border-ongc-blue text-slate-800 shadow-2xs' : 'bg-transparent border-transparent text-slate-600 hover:bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() =>
                        setEditFormData({
                          ...editFormData,
                          assigned_tasks: toggleTaskSelection(editFormData.assigned_tasks || [], task.label),
                        })
                      }
                      className="mt-0.5 rounded border-slate-300 text-ongc-blue focus:ring-ongc-blue"
                    />
                    <div>
                      <span className="font-semibold leading-tight block text-slate-800">{task.label}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingUser(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={updateMutation.isPending}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

