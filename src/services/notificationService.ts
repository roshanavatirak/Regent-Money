import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useNotificationStore, useAuthStore } from '../store';
import { authService } from './authService';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

// Set notification handler for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const notificationService = {
  /**
   * Request permissions and retrieve Expo Push Token, then send it to the backend.
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

      if (finalStatus !== 'granted') {
        console.warn('[NotificationService] Push notification permissions denied.');
        return null;
      }

      // Configure Android Channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#03DAC6',
        });
      }

      // Retrieve token (EAS projectId is from app.json)
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '9dfdd6a4-7f59-4983-8722-0eaa4eb83e78',
      });
      const token = tokenData.data;
      console.log('[NotificationService] Expo Push Token obtained:', token);

      // Send token to backend
      await this.registerTokenOnBackend(token);

      return token;
    } catch (error: any) {
      console.warn(
        '[NotificationService] Failed to register push token (FCM/Expo Push may not be configured in this build):',
        error.message,
      );
      return null;
    }
  },

  /**
   * Upload push token to NestJS backend.
   */
  async registerTokenOnBackend(token: string): Promise<void> {
    const accessToken = authService.getAccessToken();
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
      console.log('[NotificationService] Push token registered on NestJS backend.');
    } catch (err: any) {
      console.warn('[NotificationService] Failed to upload push token to backend:', err.message);
    }
  },

  /**
   * Fetch all notifications from the backend database.
   */
  async fetchNotifications(): Promise<void> {
    const accessToken = authService.getAccessToken();
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

      useNotificationStore.getState().setNotifications(mapped);
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
    const accessToken = authService.getAccessToken();
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
   * Delete a notification.
   */
  async deleteNotification(id: string): Promise<void> {
    const accessToken = authService.getAccessToken();
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
    const notificationListener = Notifications.addNotificationReceivedListener(onReceived);
    const responseListener = Notifications.addNotificationResponseReceivedListener(onResponse);

    return () => {
      notificationListener.remove();
      responseListener.remove();
    };
  },
};
