import { apiFetch } from './apiClient';

export interface AdminUserItem {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: 'user' | 'admin' | 'superadmin';
  isBanned: boolean;
  bannedAt: number | null;
  banReason: string | null;
  isVerified: boolean;
  authProvider: string | null;
  createdAt: number | null;
  avatarUrl?: string | null;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
}

export interface AdminAuditLogItem {
  id: string;
  adminId: string;
  targetUserId: string;
  targetEmailHmac?: string | null;
  action: string;
  reason: string;
  metadata?: any;
  createdAt: number;
}

export const adminService = {
  async getStats(): Promise<AdminStats> {
    const res = await apiFetch('/admin/stats');
    if (!res.ok) {
      throw new Error(`Failed to load admin stats (${res.status})`);
    }
    return res.json();
  },

  async getUsers(page = 1, limit = 25, search = ''): Promise<{
    users: AdminUserItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search.trim()) {
      params.set('search', search.trim());
    }

    const res = await apiFetch(`/admin/users?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to fetch users (${res.status})`);
    }
    return res.json();
  },

  async getLogs(page = 1, limit = 25): Promise<{
    logs: AdminAuditLogItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    const res = await apiFetch(`/admin/logs?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to fetch audit logs (${res.status})`);
    }
    return res.json();
  },

  async banUser(userId: string, reason: string): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch(`/admin/users/${userId}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Failed to ban user (${res.status})`);
    }
    return data;
  },

  async unbanUser(userId: string): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch(`/admin/users/${userId}/unban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Failed to unban user (${res.status})`);
    }
    return data;
  },

  async deleteUser(
    userId: string,
    confirmEmail: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch(`/admin/users/${userId}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmEmail, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Failed to permanently delete user (${res.status})`);
    }
    return data;
  },
};
