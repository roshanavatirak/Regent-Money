import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useNotificationStore, useAuthStore } from '../store';
import { getBackendUrl } from '../config/api';
import { mmkvStorage } from '../db/mmkv';
import { tokenStore } from './tokenStore';
import { getDailyHumorMessage } from './humorousMessages';

const BACKEND_URL = getBackendUrl();
const PROMPTED_KEY = 'notification_permission_prompted';
const TOKEN_KEY = 'saved_expo_push_token';

const getAuthToken = (): string | null => tokenStore.getAccessToken();

// Set notification handler for foreground notifications on mobile
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export const notificationService = {
  /**
   * Sets up high-priority Android notification channels with sound, vibration, and light
   */
  async setupChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      await Notifications.setNotificationChannelAsync('daily_alerts', {
        name: 'Daily Check-ins & Reminders',
        description: 'Morning and evening humorous wealth updates and check-ins',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });

      await Notifications.setNotificationChannelAsync('default', {
        name: 'General Alerts',
        description: 'Standard system and account notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });
    } catch (e: any) {
      console.warn('[NotificationService] Failed to configure Android channels:', e.message);
    }
  },

  /**
   * Schedules recurring 9:00 AM and 9:00 PM native device notifications directly with Android OS.
   * This guarantees status-bar / heads-up banners even if backend is sleeping or device is offline.
   */
  async scheduleDailyHumorNotifications(): Promise<void> {
    if (Platform.OS === 'web') return;

    try {
      const granted = await this.isPermissionGranted();
      if (!granted) {
        console.log('[NotificationService] Permission not granted. Skipping daily notification schedule.');
        return;
      }

      await this.setupChannels();

      // Cancel previous scheduled daily humor notifications to prevent duplicates
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const item of scheduled) {
        if (item.identifier.startsWith('daily_humor_')) {
          await Notifications.cancelScheduledNotificationAsync(item.identifier);
        }
      }

      const morningMsg = getDailyHumorMessage('morning');
      const eveningMsg = getDailyHumorMessage('evening');

      // 1. Schedule 9:00 AM Morning Notification (Local device time)
      await Notifications.scheduleNotificationAsync({
        identifier: 'daily_humor_morning',
        content: {
          title: morningMsg.title,
          body: morningMsg.body,
          sound: 'default',
          color: '#10B981',
          data: { slot: 'morning', type: 'daily_humor' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          channelId: 'daily_alerts',
          hour: 9,
          minute: 0,
        },
      });

      // 2. Schedule 9:00 PM Evening Notification (21:00 Local device time)
      await Notifications.scheduleNotificationAsync({
        identifier: 'daily_humor_evening',
        content: {
          title: eveningMsg.title,
          body: eveningMsg.body,
          sound: 'default',
          color: '#10B981',
          data: { slot: 'evening', type: 'daily_humor' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          channelId: 'daily_alerts',
          hour: 21,
          minute: 0,
        },
      });

      console.log('[NotificationService] Successfully scheduled native 9:00 AM & 9:00 PM daily notifications.');
    } catch (err: any) {
      console.warn('[NotificationService] Failed to schedule native daily notifications:', err.message);
    }
  },

  /**
   * Cancels scheduled native daily notifications
   */
  async cancelDailyScheduledNotifications(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await Notifications.cancelScheduledNotificationAsync('daily_humor_morning');
      await Notifications.cancelScheduledNotificationAsync('daily_humor_evening');
      console.log('[NotificationService] Daily scheduled notifications cancelled.');
    } catch (e: any) {
      console.warn('[NotificationService] Error cancelling scheduled notifications:', e.message);
    }
  },

  /**
   * Check whether OS push notification permission is currently granted.
   */
  async isPermissionGranted(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  },

  /**
   * Has the user already seen the onboarding notification permission prompt?
   */
  hasBeenPrompted(): boolean {
    return mmkvStorage.getBoolean(PROMPTED_KEY) || false;
  },

  /**
   * Mark that the user was prompted for notification permission.
   */
  setPrompted(val: boolean = true): void {
    mmkvStorage.setBoolean(PROMPTED_KEY, val);
  },

  /**
   * Request permissions, configure channels, schedule native daily alerts, and register token.
   */
  async registerForPushNotifications(): Promise<string | null> {
    const user = useAuthStore.getState().user;
    if (!user) {
      console.warn('[NotificationService] No user session. Skipping token registration.');
      return null;
    }

    if (Platform.OS === 'web') {
      return null;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      this.setPrompted(true);

      if (finalStatus !== 'granted') {
        console.warn('[NotificationService] Push notification permissions denied.');
        return null;
      }

      // Configure Android Channels and schedule direct 9 AM & 9 PM local alarms
      await this.setupChannels();
      await this.scheduleDailyHumorNotifications();

      // Retrieve Expo Push token for remote backend broadcasts
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: '9dfdd6a4-7f59-4983-8722-0eaa4eb83e78',
        });
        const token = tokenData.data;
        console.log('[NotificationService] Expo Push Token obtained:', token);
        mmkvStorage.setString(TOKEN_KEY, token);

        // Send token to backend
        await this.registerTokenOnBackend(token);
        return token;
      } catch (tokenErr: any) {
        console.warn(
          '[NotificationService] Remote push token unavailable in this build (standalone FCM not attached). Native scheduled alarms are active:',
          tokenErr.message,
        );
        return 'local_scheduled_active';
      }
    } catch (error: any) {
      console.warn('[NotificationService] Error in registerForPushNotifications:', error.message);
      return null;
    }
  },

  /**
   * Unregister / remove push token from backend and local cache, and cancel local alarms.
   */
  async unregisterPushToken(): Promise<void> {
    mmkvStorage.delete(TOKEN_KEY);
    await this.cancelDailyScheduledNotifications();
    await this.registerTokenOnBackend(null);
  },

  /**
   * Upload push token to NestJS backend (or clear if null).
   */
  async registerTokenOnBackend(token: string | null): Promise<void> {
    const accessToken = getAuthToken();
    if (!accessToken) return;

    try {
      const response = await fetch(`${BACKEND_URL}/notifications/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }
      console.log('[NotificationService] Push token successfully updated on NestJS backend.');
    } catch (err: any) {
      console.warn('[NotificationService] Failed to upload push token to backend:', err.message);
    }
  },

  /**
   * Fetch all notifications from the backend database.
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
      // Map properties from database to local state
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

      // Retain local notifications so locally-generated alerts are not wiped
      const current = useNotificationStore.getState().notifications || [];
      const localOnly = current.filter((c) => c.userId === 'local' || !c.userId || c.id.startsWith('notif_'));
      const combined = [...mapped, ...localOnly];

      useNotificationStore.getState().setNotifications(combined);
    } catch (err: any) {
      console.error('[NotificationService] Error syncing notifications:', err.message);
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

    // Optimistically update store
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
      console.warn('[NotificationService] Failed to mark notification as read on server:', err.message);
    }
  },

  /**
   * Mark all notifications as read.
   */
  async markAllAsRead(): Promise<void> {
    // Optimistically update local store and persist to MMKV
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
        // Fallback: loop through unread items if read-all fails
        const unread = useNotificationStore.getState().notifications.filter((n) => !n.readStatus);
        for (const item of unread) {
          await this.markAsRead(item.id);
        }
      }
    } catch (err: any) {
      console.warn('[NotificationService] Failed to mark all notifications as read on server:', err.message);
    }
  },

  /**
   * Delete a notification.
   */
  async deleteNotification(id: string): Promise<void> {
    const accessToken = getAuthToken();
    if (!accessToken) return;

    // Optimistically update store
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
      console.warn('[NotificationService] Failed to delete notification on server:', err.message);
    }
  },

  /**
   * Subscribes to foreground/background notification event triggers.
   */
  setupListeners(
    onReceived: (notification: Notifications.Notification) => void,
    onResponse: (response: Notifications.NotificationResponse) => void,
  ) {
    if (Platform.OS === 'web') {
      return () => {};
    }
    const notificationListener = Notifications.addNotificationReceivedListener(onReceived);
    const responseListener = Notifications.addNotificationResponseReceivedListener(onResponse);

    return () => {
      notificationListener.remove();
      responseListener.remove();
    };
  },
};
