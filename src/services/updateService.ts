import { Platform, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import appConfig from '../../app.json';
import { BACKEND_URL } from '../config/api';

/** One line in "What's new". */
export interface ReleaseNote {
  title: string;
  detail?: string;
}

export interface UpdateInfo {
  isUpdateAvailable: boolean;
  forceUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  /** Comes from the server only. Empty means the "What's new" section is hidden. */
  releaseNotes: ReleaseNote[];
}

/**
 * Accepts notes from the server in either shape:
 *   "Faster SMS sync: Bank alerts are caught while your phone sleeps"
 *   { "title": "Faster SMS sync", "detail": "Bank alerts are caught while your phone sleeps" }
 */
const normalizeNotes = (raw: unknown): ReleaseNote[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n: any): ReleaseNote | null => {
      if (n && typeof n === 'object' && typeof n.title === 'string') {
        return { title: n.title.trim(), detail: typeof n.detail === 'string' ? n.detail.trim() : undefined };
      }
      if (typeof n === 'string' && n.trim()) {
        const i = n.indexOf(':');
        return i > 0 ? { title: n.slice(0, i).trim(), detail: n.slice(i + 1).trim() } : { title: n.trim() };
      }
      return null;
    })
    .filter((n): n is ReleaseNote => !!n && !!n.title);
};

/**
 * Single source of truth for the application version is app.json.
 * On native builds, Application.nativeApplicationVersion reads the native binary's versionName.
 */
export const BASE_APP_VERSION = (appConfig?.expo?.version || '1.0.0').replace(/^v/, '').trim();

export const getAppCurrentVersion = (): string => {
  if (Platform.OS !== 'web') {
    const nativeVer = Application.nativeApplicationVersion;
    if (nativeVer && typeof nativeVer === 'string' && nativeVer.trim().length > 0) {
      return nativeVer.replace(/^v/, '').trim();
    }
  }
  if (appConfig?.expo?.version) {
    return appConfig.expo.version.replace(/^v/, '').trim();
  }
  return BASE_APP_VERSION;
};

export const APP_CURRENT_VERSION = getAppCurrentVersion();

class UpdateService {
  private compareVersions(v1: string, v2: string): number {
    const p1 = (v1 || '0.0.0').replace(/^v/, '').trim().split('.').map((p) => parseInt(p, 10) || 0);
    const p2 = (v2 || '0.0.0').replace(/^v/, '').trim().split('.').map((p) => parseInt(p, 10) || 0);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const a = p1[i] || 0;
      const b = p2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  /** Ask the backend whether a newer version exists. */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (Platform.OS === 'web') return null;
    if (__DEV__) return null; // Never block local development with production APK self-updates

    const currentVersion = getAppCurrentVersion();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const url = `${BACKEND_URL}/app/version-check?platform=${Platform.OS}&currentVersion=${encodeURIComponent(currentVersion)}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) return null;

      const data = await res.json();
      const latestVersion = (data.latestVersion || currentVersion).replace(/^v/, '').trim();
      const isUpdateAvailable = this.compareVersions(latestVersion, currentVersion) > 0;
      if (!isUpdateAvailable) return null;

      return {
        isUpdateAvailable,
        forceUpdate: !!data.forceUpdate,
        currentVersion,
        latestVersion,
        downloadUrl:
          data.downloadUrl ||
          'https://github.com/roshanavatirak/Regent-Money/releases/latest/download/regent-money.apk',
        releaseNotes: normalizeNotes(data.releaseNotes),
      };
    } catch (e) {
      console.warn('[UpdateService] Update check failed:', e);
      return null;
    }
  }

  /** Opens the Android package installer for an APK already on the device. */
  async installApk(fileUri: string): Promise<boolean> {
    try {
      if (Platform.OS !== 'android') return false;
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      // FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (268435456)
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1 | 268435456,
        type: 'application/vnd.android.package-archive',
      });
      return true;
    } catch (err) {
      console.warn('[UpdateService] Failed to launch package installer for URI:', fileUri, err);
      return false;
    }
  }

  /** Downloads the APK with live progress, then opens the installer. */
  async downloadAndInstallApk(
    downloadUrl: string,
    onProgress: (percent: number, loadedMB: string, totalMB: string) => void
  ): Promise<{ success: boolean; fileUri?: string; installerLaunched: boolean; error?: string }> {
    try {
      if (Platform.OS !== 'android') {
        const opened = await this.startInstall(downloadUrl);
        return { success: opened, installerLaunched: opened };
      }

      const fileUri = `${FileSystem.documentDirectory}regent-money-update.apk`;
      try {
        const info = await FileSystem.getInfoAsync(fileUri);
        if (info.exists) await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch {}

      const resumable = FileSystem.createDownloadResumable(downloadUrl, fileUri, {}, (p) => {
        const written = p.totalBytesWritten;
        const total = p.totalBytesExpectedToWrite;
        const percent = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
        onProgress(percent, (written / (1024 * 1024)).toFixed(1), total > 0 ? (total / (1024 * 1024)).toFixed(1) : '...');
      });

      const result = await resumable.downloadAsync();
      if (!result || !result.uri) throw new Error('The update file didn’t download.');

      onProgress(100, '', '');
      const installerLaunched = await this.installApk(result.uri);
      return { success: true, fileUri: result.uri, installerLaunched };
    } catch (err: any) {
      console.warn('[UpdateService] In-app install error:', err);
      return { success: false, installerLaunched: false, error: err?.message || 'The download didn’t finish.' };
    }
  }

  /** Fallback: open the download link in the browser. */
  async startInstall(downloadUrl: string): Promise<boolean> {
    try {
      await Linking.openURL(downloadUrl);
      return true;
    } catch (err) {
      console.error('[UpdateService] Error launching download URL:', err);
      return false;
    }
  }

  /** Opens Google Play (Android). */
  async openStore(): Promise<boolean> {
    const id = Application.applicationId || appConfig?.expo?.android?.package || 'com.anonymous.regentmoney';
    const urls = Platform.OS === 'android' ? [`market://details?id=${id}`, `https://play.google.com/store/apps/details?id=${id}`] : [];
    for (const url of urls) {
      try {
        await Linking.openURL(url);
        return true;
      } catch {}
    }
    return false;
  }
}

export const updateService = new UpdateService();