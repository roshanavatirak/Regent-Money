/**
 * Android notification channel that every push goes to. Must match
 * NOTIFICATION_CHANNELS.DAILY_ALERTS in the app (src/services/notificationService.ts).
 *
 * It is 'daily_alerts_v2' because the old 'daily_alerts' channel was created silent on
 * users' phones and Android never lets an app change a channel's sound afterwards.
 * App versions without this channel still get the push, on expo-notifications' fallback channel.
 */
export const PUSH_CHANNEL_ID = 'daily_alerts_v2';
