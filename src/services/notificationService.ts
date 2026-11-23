import * as Notifications from 'expo-notifications';
import { isRunningInExpoGo } from 'expo';
import { Linking, Platform } from 'react-native';
import { useNotificationStore, useAuthStore } from '../store';
import { BACKEND_URL, getBackendUrl } from '../config/api';
import { mmkvStorage } from '../db/mmkv';
import { tokenStore } from './tokenStore';
import { getDailyHumorMessage } from './humorousMessages';
import { navigationRef } from '../navigation/navigationRef';

const PROMPTED_KEY = 'notification_permission_prompted';
const LAST_ASKED_KEY = 'notification_permission_last_asked_at';
// Refused? Ask again on the first app open at least this long after the last ask
const REASK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
let askInFlight = false;
const TOKEN_KEY = 'saved_expo_push_token';

/**
 * Android notification channels. Android never lets an app change a channel's sound once it
 * exists, and the old 'daily_alerts' / 'default' channels were created silent (they passed
 * `sound: 'default'`, a sound file that doesn't exist). New IDs give everyone channels with
 * sound. The backend sends pushes to DAILY_ALERTS, so keep the two in step.
 */
export const NOTIFICATION_CHANNELS = {
  DAILY_ALERTS: 'daily_alerts_v2',
  GENERAL: 'general_v2',
} as const;
const LEGACY_CHANNEL_IDS = ['daily_alerts', 'default'];
const LEGACY_CHANNELS_REMOVED_KEY = 'notification_legacy_channels_removed_v1';

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
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.DAILY_ALERTS, {
        name: 'Daily Check-ins & Reminders',
        description: 'Morning and evening humorous wealth updates and check-ins',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        // No `sound` key: leaving it out gives the phone's default notification sound.
        // `sound: 'default'` means "a sound file named default", which doesn't exist, so
        // expo-notifications logged an error and created the channel with no sound.
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });

      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.GENERAL, {
        name: 'General Alerts',
        description: 'Standard system and account notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });

      // Remove the old silent channels so phone settings don't list them twice. Only once:
      // nothing in the app recreates them, and deleting is a no-op after that.
      if (!mmkvStorage.getBoolean(LEGACY_CHANNELS_REMOVED_KEY)) {
        for (const id of LEGACY_CHANNEL_IDS) {
          await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
        }
        mmkvStorage.setBoolean(LEGACY_CHANNELS_REMOVED_KEY, true);
      }
    } catch (e: any) {
      console.warn('[NotificationService] Failed to configure Android channels:', e.message);
    }
  },

  /**
   * Global function to post or schedule any notification from the app with Regent Money branding.
   * Ensures channelId, forest badge color (#0B3D2C), high priority, and logo styling are unified.
   */
  async postNotification(params: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    channelId?: string;
    identifier?: string;
    trigger?: Notifications.NotificationTriggerInput;
  }): Promise<string | null> {
    if (Platform.OS === 'web') return null;

    try {
      await this.setupChannels();
      const channel = params.channelId || NOTIFICATION_CHANNELS.DAILY_ALERTS;

      const content: Notifications.NotificationContentInput = {
        title: params.title,
        body: params.body,
        sound: 'default',
        color: '#0B3D2C',
        data: params.data || {},
        priority: 'high',
      };

      if (params.trigger) {
        return await Notifications.scheduleNotificationAsync({
          identifier: params.identifier,
          content,
          trigger: params.trigger,
        });
      } else {
        return await Notifications.scheduleNotificationAsync({
          identifier: params.identifier,
          content,
          trigger: {
            channelId: channel,
            seconds: 1,
          } as any,
        });
      }
    } catch (e: any) {
      console.warn('[NotificationService] Failed to post notification:', e.message);
      return null;
    }
  },

  /**
   * Deprecated: Hardcoded daily humor alarms are discontinued in favor of
   * personalized backend signals. Calling this cleans up any residual local alarms.
   */
  async scheduleDailyHumorNotifications(): Promise<void> {
    await this.cancelDailyScheduledNotifications();
  },

  /**
   * Cancels scheduled native daily notifications (including legacy humor alarms).
   */
  async cancelDailyScheduledNotifications(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const item of scheduled) {
        if (item.identifier.startsWith('daily_humor_')) {
          await Notifications.cancelScheduledNotificationAsync(item.identifier);
        }
      }
      await Notifications.cancelScheduledNotificationAsync('daily_humor_morning');
      await Notifications.cancelScheduledNotificationAsync('daily_humor_evening');
      console.log('[NotificationService] Legacy daily scheduled notifications cancelled.');
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
   * Is it time to show the notification dialog? Never asked, or refused and the last ask
   * was 7 or more days ago. Never true once granted.
   */
  async isAskDue(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    if (await this.isPermissionGranted()) return false;
    const lastAsked = mmkvStorage.getNumber(LAST_ASKED_KEY);
    // No time saved: never asked, or asked by an older version that kept no date
    if (!lastAsked) return true;
    return Date.now() - lastAsked >= REASK_AFTER_MS;
  },

  /**
   * Shows the dialog only if isAskDue(). Returns whether notifications are now allowed.
   */
  async requestPermissionIfDue(): Promise<boolean> {
    if (!(await this.isAskDue())) return this.isPermissionGranted();
    return this.requestPermission();
  },

  /**
   * Shows the system "Allow notifications?" dialog inside the app. Needs no signed-in
   * user: the push token is registered after sign-in. Returns whether it was granted.
   */
  async requestPermission(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.status === 'granted') return true;
      if (askInFlight) return false;
      askInFlight = true;
      // Saved before the dialog opens: the dialog briefly sends the app to the background,
      // and coming back must not count as a new "app open" that asks a second time
      mmkvStorage.setNumber(LAST_ASKED_KEY, Date.now());
      // Android 13+ shows the dialog only once the app has a notification channel
      await this.setupChannels();
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    } catch (e: any) {
      console.warn('[NotificationService] Permission request failed:', e?.message);
      return false;
    } finally {
      askInFlight = false;
      this.setPrompted(true);
    }
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
      const granted = await this.requestPermission();
      if (!granted) {
        console.warn('[NotificationService] Push notification permissions denied.');
        return null;
      }

      // Configure Android Channels and clear legacy local alarms
      await this.setupChannels();
      await this.cancelDailyScheduledNotifications();

      // In Expo Go on Android, remote push tokens are not supported (SDK 53+).
      if (Platform.OS === 'android' && isRunningInExpoGo()) {
        console.log('[NotificationService] Running in Expo Go on Android. Skipping remote push token registration.');
        return 'expo_go_active';
      }

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
        console.error(
          '[NotificationService] Remote push token unavailable (standalone FCM not attached or misconfigured):',
          tokenErr.message,
        );
        return null;
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
      const parsePayload = (p: any) => {
        if (!p) return null;
        if (typeof p === 'object') return p;
        try {
          return JSON.parse(p);
        } catch {
          return null;
        }
      };

      // Map properties from database to local state
      const mapped = data.map((n: any) => ({
        id: n.id,
        userId: n.userId ?? n.user_id,
        agentId: n.agentId ?? n.agent_id,
        title: n.title,
        body: n.body,
        type: n.type,
        readStatus: n.readStatus ?? n.read_status,
        payload: parsePayload(n.payload),
        createdAt: Number(n.createdAt ?? n.created_at ?? Date.now()),
      }));

      // Retain local notifications so locally-generated alerts are not wiped
      const current = useNotificationStore.getState().notifications || [];
      const localOnly = current.filter((c) => c.userId === 'local' || !c.userId || c.id.startsWith('notif_'));
      const combined = [...mapped, ...localOnly];

      useNotificationStore.getState().setNotifications(combined);
    } catch (err: any) {
      console.warn('[NotificationService] Error syncing notifications:', err.message);
    } finally {
      useNotificationStore.getState().setLoading(false);
    }
  },

  /**
   * Tracks when a user opens a notification from device tray or notification center,
   * recording analytics to core.notification_log and marking read in core.notifications.
   */
  async markAsOpened(id: string): Promise<void> {
    if (!id) return;
    const accessToken = getAuthToken();

    // Optimistically update local store
    useNotificationStore.getState().markAsReadState(id);

    if (!accessToken) return;

    try {
      const response = await fetch(`${BACKEND_URL}/notifications/opened`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationId: id }),
      });

      if (!response.ok) {
        // Fallback to standard mark-as-read endpoint
        await this.markAsRead(id);
      }
    } catch (err: any) {
      console.warn('[NotificationService] Failed to record notification opened state:', err.message);
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
   * Routes the user to the relevant screen when a deep link is received from a notification.
   */
  handleNotificationDeepLink(deepLink?: string | null): void {
    if (!deepLink) return;

    const route = deepLink.replace(/^regent:\/\//, '').toLowerCase().trim();

    const navigateTo = () => {
      if (!navigationRef.isReady()) {
        setTimeout(navigateTo, 200);
        return;
      }

      try {
        if (route.startsWith('budget')) {
          (navigationRef.navigate as any)('Main', { screen: 'Budgets' });
        } else if (route.startsWith('goal')) {
          (navigationRef.navigate as any)('Main', { screen: 'Goals' });
        } else if (route.startsWith('bank')) {
          (navigationRef.navigate as any)('Main', { screen: 'Banks' });
        } else if (route.startsWith('chat') || route.startsWith('regent')) {
          (navigationRef.navigate as any)('Main', { screen: 'Regent' });
        } else if (route.startsWith('transactions')) {
          (navigationRef.navigate as any)('AllTransactions');
        } else if (route.startsWith('borrow')) {
          (navigationRef.navigate as any)('BorrowLend');
        } else if (route.startsWith('transaction') || route.startsWith('home')) {
          (navigationRef.navigate as any)('Main', { screen: 'Home' });
        } else if (route.startsWith('calendar')) {
          (navigationRef.navigate as any)('FinancialCalendar');
        } else if (route.startsWith('feedback/bug')) {
          (navigationRef.navigate as any)('ReportBug');
        } else if (route.startsWith('feedback/feature')) {
          (navigationRef.navigate as any)('SuggestFeature');
        } else {
          (navigationRef.navigate as any)('Main', { screen: 'Home' });
        }
      } catch (err: any) {
        console.warn('[NotificationService] Failed to navigate deep link:', err.message);
      }
    };

    navigateTo();
  },

  /**
   * Opens an external link sent with a notification. Only Play Store listings are allowed,
   * so a broadcast can never send users to an arbitrary website.
   */
  async handleNotificationUrl(url?: string | null): Promise<void> {
    if (typeof url !== 'string') return;
    const match = url.trim().match(/^https:\/\/play\.google\.com\/store\/apps\/details\?id=([\w.]+)/);
    if (!match) return;
    const id = match[1];
    const candidates = Platform.OS === 'android' ? [`market://details?id=${id}`, url.trim()] : [url.trim()];
    for (const target of candidates) {
      try {
        await Linking.openURL(target);
        return;
      } catch {}
    }
  },

  /**
   * Initializes automatic response listening and cold-start detection.
   * Tracks open status to backend and navigates to deepLink destination.
   */
  initNotificationResponseHandler(): () => void {
    if (Platform.OS === 'web') return () => {};

    const handleResponse = (response: Notifications.NotificationResponse) => {
      try {
        const data = response?.notification?.request?.content?.data as any;
        const notificationId =
          data?.notificationId ||
          (response.notification.request.identifier?.startsWith('notif_')
            ? response.notification.request.identifier
            : undefined);
        const deepLink = data?.deepLink;

        if (notificationId) {
          this.markAsOpened(notificationId).catch(() => {});
        }
        if (data?.action === 'open_url' && data?.url) {
          this.handleNotificationUrl(data.url).catch(() => {});
        } else if (deepLink) {
          this.handleNotificationDeepLink(deepLink);
        }
      } catch (err: any) {
        console.warn('[NotificationService] Error handling notification response:', err.message);
      }
    };

    // 1. Listen for user taps when app is in background or foreground
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);

    // 2. Check cold start (when app launched by clicking notification while killed)
    Notifications.getLastNotificationResponseAsync()
      .then((lastResponse) => {
        if (lastResponse) {
          handleResponse(lastResponse);
        }
      })
      .catch(() => {});

    return () => {
      sub.remove();
    };
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

/**
 * Universal global function to send an app notification with Regent Money branding and right-side logo.
 */
export const sendAppNotification = (params: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  identifier?: string;
}) => notificationService.postNotification(params);
