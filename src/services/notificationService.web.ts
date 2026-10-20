import { useNotificationStore, useAuthStore } from '../store';
import { BACKEND_URL } from '../config/api';
import { mmkvStorage } from '../db/mmkv';
import { tokenStore } from './tokenStore';

const PROMPTED_KEY = 'notification_permission_prompted';

const getAuthToken = (): string | null => tokenStore.getAccessToken();

/**
 * Web implementation of notificationService.
 * Avoids importing expo-notifications on web to eliminate unsupported listener warnings
 * and reduce bundle footprint while preserving all database notification sync features.
 */
export const notificationService = {
  async setupChannels(): Promise<void> {
    // No-op on web
  },

  async postNotification(_params: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    channelId?: string;
    identifier?: string;
    trigger?: any;
  }): Promise<string | null> {
    return null;
  },

  async scheduleDailyHumorNotifications(): Promise<void> {
    // Native local alarms are not applicable on web
  },

  async cancelDailyScheduledNotifications(): Promise<void> {
    // No-op on web
  },

  async isPermissionGranted(): Promise<boolean> {
    return false;
  },

  hasBeenPrompted(): boolean {
    return mmkvStorage.getBoolean(PROMPTED_KEY) || false;
  },

  setPrompted(val: boolean = true): void {
    mmkvStorage.setBoolean(PROMPTED_KEY, val);
  },

  async registerForPushNotifications(): Promise<string | null> {
    return null;
  },

  async unregisterPushToken(): Promise<void> {
    // No-op on web
  },

  async registerTokenOnBackend(_token: string | null): Promise<void> {
    // No-op on web
  },

  /**
   * Fetch all notifications from the backend database on web.
   */
  async fetchNotifications(): Promise<void> {
    const accessToken = getAuthToken();
    if (!accessToken) return;

    useNotificationStore.getState().setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Sync notifications failed: status ${response.status}`);
      }

      const data = await response.json();
      const mapped = data.map((n: any) => ({
        id: n.id,
        userId: n.userId ?? n.user_id,
        agentId: n.agentId ?? n.agent_id,
        title: n.title,
        body: n.body,
        type: n.type,
        readStatus: n.readStatus ?? n.read_status,
        payload: n.payload,
        createdAt: Number(n.createdAt ?? n.created_at ?? Date.now()),
      }));

      const current = useNotificationStore.getState().notifications || [];
      const localOnly = current.filter((c) => c.userId === 'local' || !c.userId || c.id.startsWith('notif_'));
      const combined = [...mapped, ...localOnly];

      useNotificationStore.getState().setNotifications(combined);
    } catch (err: any) {
      console.warn('[NotificationService Web] Error syncing notifications:', err.message);
    } finally {
      useNotificationStore.getState().setLoading(false);
    }
  },

  /**
   * Mark a notification as read.
   */
  async markAsRead(id: string): Promise<void> {
    const accessToken = getAuthToken();
    if (!accessToken) return;

    useNotificationStore.getState().markAsReadState(id);

    try {
      const response = await fetch(`${BACKEND_URL}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }
    } catch (err: any) {
      console.warn('[NotificationService Web] Failed to mark notification as read on server:', err.message);
    }
  },

  /**
   * Mark all notifications as read.
   */
  async markAllAsRead(): Promise<void> {
    useNotificationStore.getState().markAllAsReadState();

    const accessToken = getAuthToken();
    if (!accessToken) return;

    try {
      const response = await fetch(`${BACKEND_URL}/notifications/read-all`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const unread = useNotificationStore.getState().notifications.filter((n) => !n.readStatus);
        for (const item of unread) {
          await this.markAsRead(item.id);
        }
      }
    } catch (err: any) {
      console.warn('[NotificationService Web] Failed to mark all notifications as read on server:', err.message);
    }
  },

  /**
   * Delete a notification.
   */
  async deleteNotification(id: string): Promise<void> {
    const accessToken = getAuthToken();
    if (!accessToken) return;

    useNotificationStore.getState().deleteNotificationState(id);

    try {
      const response = await fetch(`${BACKEND_URL}/notifications/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }
    } catch (err: any) {
      console.warn('[NotificationService Web] Failed to delete notification on server:', err.message);
    }
  },

  /**
   * Subscribes to notification event triggers (no-op on web).
   */
  setupListeners(
    _onReceived: (notification: any) => void,
    _onResponse: (response: any) => void,
  ) {
    return () => {};
  },
};

export const sendAppNotification = (params: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  identifier?: string;
}) => notificationService.postNotification(params);
