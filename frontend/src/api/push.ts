import { api } from './client';
import type { EmailKind } from './admin';

export interface PushDevice {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSentAt: string | null;
}

export const pushApi = {
  key: () => api.get<{ publicKey: string }>('/push/key'),
  devices: () => api.get<PushDevice[]>('/push/devices'),
  subscribe: (subscription: PushSubscriptionJSON) => api.post<{ success: true }>('/push/subscription', { subscription }),
  unsubscribe: (endpoint: string) => api.del<{ success: true }>('/push/subscription', { endpoint }),
  /** Admin only: a sample of one kind to the admin's own devices. */
  test: (kind: EmailKind, language: string) => api.post<{ sent: number; devices: number }>('/push/test', { kind, language }),
};
