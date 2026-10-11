import { api, ApiError } from './client';
import type { User } from './types';

export interface CreateUserInput {
  email: string;
  username: string;
  password: string;
  displayName?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface UpdateUserInput {
  email?: string;
  displayName?: string | null;
  phone?: string | null;
  notes?: string | null;
  isActive?: boolean;
  password?: string;
}

export const usersApi = {
  list: () => api.get<User[]>('/users'),
  create: (input: CreateUserInput) => api.post<User>('/users', input),
  update: (id: string, input: UpdateUserInput) => api.patch<User>(`/users/${id}`, input),
  remove: (id: string) => api.del<void>(`/users/${id}`),
};

export const avatarsApi = {
  url: (userId: string) => `/backend/api/avatars/${userId}`,

  /** FormData upload, so it bypasses the JSON client and posts directly. */
  upload: async (file: File): Promise<User> => {
    const form = new FormData();
    form.append('avatar', file);
    const res = await fetch('/backend/api/avatars/me', {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? 'Upload failed');
    }
    return res.json();
  },

  remove: async (): Promise<User> => {
    const res = await fetch('/backend/api/avatars/me', { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? 'Remove failed');
    }
    return res.json();
  },
};
