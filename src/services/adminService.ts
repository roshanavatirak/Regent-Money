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

export interface AdminBroadcast {
  id: string;
  title: string;
  body: string;
  type: string;
  payload?: any;
  targetFilter: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalTargeted: number;
  pushQueued: number;
  pushDelivered: number;
  pushFailed: number;
  createdAt: number;
  completedAt?: number | null;
  createdBy?: string | null;
}

export interface AudienceEstimate {
  totalUsers: number;
  pushEnabledUsers: number;
}

export interface AdminEmailBroadcast {
  id: string;
  subject: string;
  bodyMarkdown: string;
  category: 'announcement' | 'policy_update' | 'security_tip' | 'service_notice';
  label?: string | null;
  targetType: 'all_verified' | 'specific_user' | 'custom_list';
  targetUserId?: string | null;
  status: 'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  dailyQuotaExhausted: boolean;
  createdAt: number;
  completedAt?: number | null;
  createdBy: string;
}

export interface EmailQuotaStats {
  sentToday: number;
  remainingToday: number;
  dailyLimit: number;
  senderEmail?: string;
  senderName?: string;
  isConfigured?: boolean;
}

export interface PrimaryEmailStats {
  sentToday: number;
  remainingToday: number;
  dailyLimit: number;
  verificationsToday: number;
  passwordResetsToday: number;
  /** Sign-in emails sent through the broadcast account today because this one was full. */
  sentViaFallbackToday?: number;
  /** Broadcast emails this account sent today for broadcasts. */
  lentToBroadcastsToday?: number;
  senderEmail: string;
  senderName: string;
  isConfigured: boolean;
}

export interface BroadcastEmailStats {
  sentToday: number;
  remainingToday: number;
  dailyLimit: number;
  /** Extra emails broadcasts may borrow from the sign-in account today. */
  fallbackAvailable?: number;
  /** Sign-in emails this account sent today because the sign-in account was full. */
  lentToSignInToday?: number;
  senderEmail: string;
  senderName: string;
  isConfigured: boolean;
}

/** An email broadcast that hasn't been sent, for preview and test sends. */
export interface EmailDraft {
  subject: string;
  bodyMarkdown: string;
  category?: 'announcement' | 'policy_update' | 'security_tip' | 'service_notice';
  /** Small label above the title. Omit for the category's default; '' for none. */
  label?: string;
}

export interface EmailFallbackSettings {
  enabled: boolean;
  /** False when only one Brevo account is set up, so there is nothing to fall back to. */
  available: boolean;
  /** Sign-in emails the primary account always keeps for itself. */
  signInReserve: number;
}

export interface EmailSystemOverview {
  primary: PrimaryEmailStats;
  broadcast: BroadcastEmailStats;
  fallback?: EmailFallbackSettings;
}

export interface EmailAudienceEstimate {
  totalVerifiedUsers: number;
  sentToday: number;
  remainingToday: number;
  dailyLimit: number;
  fallbackAvailable?: number;
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

  async getAudienceEstimate(): Promise<AudienceEstimate> {
    const res = await apiFetch('/admin/broadcasts/audience-estimate');
    if (!res.ok) {
      throw new Error(`Failed to fetch audience estimate (${res.status})`);
    }
    return res.json();
  },

  async listBroadcasts(page = 1, limit = 20): Promise<{
    broadcasts: AdminBroadcast[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const res = await apiFetch(`/admin/broadcasts?page=${page}&limit=${limit}`);
    if (!res.ok) {
      throw new Error(`Failed to list broadcasts (${res.status})`);
    }
    return res.json();
  },

  async sendBroadcast(data: {
    title: string;
    body: string;
    type?: string;
    payload?: any;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; broadcast: AdminBroadcast }> {
    const res = await apiFetch('/admin/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || `Failed to dispatch broadcast (${res.status})`);
    }
    return json;
  },

  async getEmailQuota(): Promise<EmailQuotaStats> {
    const res = await apiFetch('/admin/emails/quota');
    if (!res.ok) {
      throw new Error(`Failed to load email quota (${res.status})`);
    }
    return res.json();
  },

  async getEmailAudienceEstimate(): Promise<EmailAudienceEstimate> {
    const res = await apiFetch('/admin/emails/audience-estimate');
    if (!res.ok) {
      throw new Error(`Failed to load email audience estimate (${res.status})`);
    }
    return res.json();
  },

  async listEmailBroadcasts(page = 1, limit = 20): Promise<{
    broadcasts: AdminEmailBroadcast[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const res = await apiFetch(`/admin/emails/broadcasts?page=${page}&limit=${limit}`);
    if (!res.ok) {
      throw new Error(`Failed to list email broadcasts (${res.status})`);
    }
    return res.json();
  },

  async sendEmailBroadcast(data: {
    subject: string;
    bodyMarkdown: string;
    category?: EmailDraft['category'];
    label?: string;
    targetType?: 'all_verified' | 'specific_user' | 'custom_list';
    targetUserId?: string;
    customEmails?: string[];
    idempotencyKey?: string;
  }): Promise<{ success: boolean; broadcast: AdminEmailBroadcast }> {
    const res = await apiFetch('/admin/emails/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || `Failed to dispatch email broadcast (${res.status})`);
    }
    return json;
  },

  async cancelEmailBroadcast(id: string): Promise<{ success: boolean; broadcast: AdminEmailBroadcast }> {
    const res = await apiFetch(`/admin/emails/broadcasts/${id}/cancel`, {
      method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || `Failed to cancel email broadcast (${res.status})`);
    }
    return json;
  },

  async getEmailSystemOverview(): Promise<EmailSystemOverview> {
    const res = await apiFetch('/admin/emails/overview');
    if (!res.ok) {
      throw new Error(`Failed to load email system overview (${res.status})`);
    }
    return res.json();
  },

  /** The exact HTML recipients get, rendered by the backend with a sample name. */
  async previewEmail(draft: EmailDraft): Promise<{ html: string }> {
    const res = await apiFetch('/admin/emails/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || `Couldn't load the preview (${res.status})`);
    }
    return json;
  },

  /** Sends one copy of the draft to the signed-in admin's own email. */
  async sendEmailDraftTest(draft: EmailDraft): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch('/admin/emails/test-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || `Test email didn't send (${res.status})`);
    }
    return json;
  },

  async setEmailFallback(enabled: boolean): Promise<{ enabled: boolean }> {
    const res = await apiFetch('/admin/emails/fallback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || `Couldn't save the setting (${res.status})`);
    }
    return json;
  },

  async sendTestEmail(
    type: 'primary' | 'broadcast',
    email?: string,
  ): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch('/admin/emails/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, email }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || `Test email delivery failed (${res.status})`);
    }
    return json;
  },
};
