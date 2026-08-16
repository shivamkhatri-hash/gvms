import api from './api';
import { User } from '../types';

export const authService = {
  async login(username: string, password: string) {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    const response = await api.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  async changePassword(current_password: string, new_password: string) {
    const response = await api.put('/auth/me/password', {
      current_password,
      new_password,
    });
    return response.data;
  },

  async getUsers(): Promise<User[]> {
    const response = await api.get<User[]>('/users');
    return response.data;
  },

  async createUser(userData: any): Promise<User> {
    const response = await api.post<User>('/users', userData);
    return response.data;
  },

  async deleteUser(userId: string) {
    const response = await api.delete(`/users/${userId}`);
    return response.data;
  },
};
