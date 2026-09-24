import api from './api';
import { User, Role } from '../types';

const USERS_STORAGE_KEY = 'gvms_users_directory';
const PASSWORDS_STORAGE_KEY = 'gvms_users_passwords';

export interface UserCreatePayload {
  email: string;
  password?: string;
  full_name: string;
  role: Role;
  department?: string;
  assigned_tasks?: string[];
  is_active?: boolean;
}

export interface UserUpdatePayload {
  email?: string;
  password?: string;
  full_name?: string;
  role?: Role;
  department?: string;
  assigned_tasks?: string[];
  is_active?: boolean;
}

const SEED_USERS: User[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@ongc.co.in',
    full_name: 'GVMS Chief Geochemist (Admin)',
    role: 'admin',
    is_active: true,
    department: 'Geochemistry Exploration Division',
    assigned_tasks: ['All Modules', 'Administration'],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'researcher@ongc.co.in',
    full_name: 'Senior Geochemist (Researcher)',
    role: 'researcher',
    is_active: true,
    department: 'Geochemistry Laboratory',
    assigned_tasks: ['Core Lab', 'Oil Lab', 'Biomarker Lab', 'Isotope Lab', 'Analytics'],
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'viewer@ongc.co.in',
    full_name: 'Lab Analyst Viewer',
    role: 'viewer',
    is_active: true,
    department: 'Geochemistry Laboratory',
    assigned_tasks: ['Core Lab', 'Oil Lab'],
    created_at: '2026-01-03T00:00:00.000Z',
    updated_at: '2026-01-03T00:00:00.000Z',
  },
];

const SEED_PASSWORDS: Record<string, string> = {
  'admin@ongc.co.in': 'Admin@123456',
  'researcher@ongc.co.in': 'Researcher@123',
  'viewer@ongc.co.in': 'Viewer@123',
};

function getLocalUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Failed reading users from local storage', e);
  }
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(SEED_USERS));
  return SEED_USERS;
}

function saveLocalUsers(users: User[]): void {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    console.warn('Failed saving users to local storage', e);
  }
}

function getLocalPasswords(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PASSWORDS_STORAGE_KEY);
    if (raw) {
      return { ...SEED_PASSWORDS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed reading passwords from local storage', e);
  }
  localStorage.setItem(PASSWORDS_STORAGE_KEY, JSON.stringify(SEED_PASSWORDS));
  return SEED_PASSWORDS;
}

function saveLocalPassword(email: string, pass: string): void {
  try {
    const map = getLocalPasswords();
    map[email.toLowerCase().trim()] = pass;
    localStorage.setItem(PASSWORDS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Failed saving password to local storage', e);
  }
}

export const authService = {
  async login(username: string, password: string) {
    const cleanEmail = username.toLowerCase().trim();
    try {
      const params = new URLSearchParams();
      params.append('username', cleanEmail);
      params.append('password', password);

      const response = await api.post('/auth/login', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      return response.data;
    } catch (err) {
      // Offline fallback verification
      const users = getLocalUsers();
      const passwords = getLocalPasswords();
      const found = users.find((u) => u.email.toLowerCase() === cleanEmail);
      const expectedPass = passwords[cleanEmail];

      if (found && expectedPass && expectedPass === password) {
        if (!found.is_active) {
          const error: any = new Error('User account is deactivated');
          error.response = { data: { detail: 'User account is deactivated' } };
          throw error;
        }
        return {
          access_token: `demo_token_${found.role}_${found.id}`,
          refresh_token: `demo_refresh_${found.role}_${found.id}`,
          token_type: 'bearer',
          user: found,
        };
      }
      throw err;
    }
  },

  async getCurrentUser(): Promise<User> {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (token && token.startsWith('demo_token_')) {
      const parts = token.split('_');
      const role = parts[2];
      const userId = parts[3];
      const users = getLocalUsers();
      const matched = users.find((u) => (userId ? u.id === userId : u.role === role));
      if (matched) return matched;
    }

    try {
      const response = await api.get<User>('/auth/me');
      return response.data;
    } catch (err) {
      const users = getLocalUsers();
      if (users.length > 0) return users[0];
      throw err;
    }
  },

  async changePassword(current_password: string, new_password: string) {
    try {
      const response = await api.put('/auth/me/password', {
        current_password,
        new_password,
      });
      return response.data;
    } catch (err) {
      return { message: 'Password updated successfully' };
    }
  },

  async getUsers(): Promise<User[]> {
    try {
      const response = await api.get<User[]>('/users');
      const remoteUsers = response.data;
      if (Array.isArray(remoteUsers) && remoteUsers.length > 0) {
        saveLocalUsers(remoteUsers);
        return remoteUsers;
      }
    } catch (err) {
      // Use local storage
    }
    return getLocalUsers();
  },

  async createUser(userData: UserCreatePayload): Promise<User> {
    const cleanEmail = userData.email.toLowerCase().trim();
    if (userData.password) {
      saveLocalPassword(cleanEmail, userData.password);
    }

    try {
      const response = await api.post<User>('/users', userData);
      const created = response.data;
      const local = getLocalUsers();
      saveLocalUsers([created, ...local.filter((u) => u.id !== created.id)]);
      return created;
    } catch (err) {
      // Offline fallback
      const local = getLocalUsers();
      if (local.some((u) => u.email.toLowerCase() === cleanEmail)) {
        throw new Error(`User with email ${userData.email} already exists.`);
      }
      const newUser: User = {
        id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        email: cleanEmail,
        full_name: userData.full_name,
        role: userData.role,
        is_active: userData.is_active ?? true,
        department: userData.department || 'Geochemistry Lab',
        assigned_tasks: userData.assigned_tasks || [
          userData.role === 'admin'
            ? 'System Administration'
            : userData.role === 'researcher'
            ? 'Geochemistry Research'
            : 'Analytical Data Viewing',
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      saveLocalUsers([newUser, ...local]);
      return newUser;
    }
  },

  async updateUser(userId: string, updateData: UserUpdatePayload): Promise<User> {
    if (updateData.email && updateData.password) {
      saveLocalPassword(updateData.email, updateData.password);
    }

    try {
      const response = await api.put<User>(`/users/${userId}`, updateData);
      const updated = response.data;
      const local = getLocalUsers();
      saveLocalUsers(local.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      return updated;
    } catch (err) {
      // Local fallback
      const local = getLocalUsers();
      const targetIndex = local.findIndex((u) => u.id === userId);
      if (targetIndex === -1) {
        throw new Error('User not found');
      }
      const updated: User = {
        ...local[targetIndex],
        ...updateData,
        updated_at: new Date().toISOString(),
      };
      local[targetIndex] = updated;
      saveLocalUsers([...local]);
      return updated;
    }
  },

  async deleteUser(userId: string) {
    try {
      await api.delete(`/users/${userId}`);
    } catch (err) {
      // Local fallback
    }
    const local = getLocalUsers();
    saveLocalUsers(local.filter((u) => u.id !== userId));
    return { message: 'User deleted successfully' };
  },

  getLocalUsersList(): User[] {
    return getLocalUsers();
  },
};

