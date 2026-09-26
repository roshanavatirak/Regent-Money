import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import appConfig from '../../app.json';
import { BACKEND_URL } from '../config/api';

export interface UpdateInfo {
  isUpdateAvailable: boolean;
  forceUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string[];
}

/**
 * Single source of truth for the application version is app.json.
 * On native builds, Application.nativeApplicationVersion reads the native binary's versionName.
 * Otherwise, falls back to Constants.expoConfig?.version or app.json directly.
 */
export const BASE_APP_VERSION = (appConfig?.expo?.version || '1.0.15').replace(/^v/, '').trim();

export const getAppCurrentVersion = (): string => {
  // On native Android / iOS standalone APK, read the installed binary version
  if (Platform.OS !== 'web') {
    const nativeVer = Application.nativeApplicationVersion;
    if (nativeVer && typeof nativeVer === 'string' && nativeVer.trim().length > 0) {
      return nativeVer.replace(/^v/, '').trim();
    }
  }

  // Directly read from app.json so web & dev immediately reflect the configured version
  if (appConfig?.expo?.version) {
    return appConfig.expo.version.replace(/^v/, '').trim();
  }

  return BASE_APP_VERSION;
};

export const APP_CURRENT_VERSION = getAppCurrentVersion();

class UpdateService {
  private compareVersions(v1: string, v2: string): number {
    const clean1 = (v1 || '0.0.0').replace(/^v/, '').trim();
    const clean2 = (v2 || '0.0.0').replace(/^v/, '').trim();

    const parts1 = clean1.split('.').map((p) => parseInt(p, 10) || 0);
    const parts2 = clean2.split('.').map((p) => parseInt(p, 10) || 0);

    const maxLen = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLen; i++) {
      const a = parts1[i] || 0;
      const b = parts2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  /**
   * Check for updates from Regent Money Backend API,
   * with fallback to GitHub Releases API if backend is unavailable.
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    // Web clients already run the latest bundle directly in browser; APK installer is for native Android
    if (Platform.OS === 'web') {
      return null;
    }

    const currentVersion = getAppCurrentVersion();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const url = `${BACKEND_URL}/app/version-check?platform=${Platform.OS}&currentVersion=${encodeURIComponent(currentVersion)}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const latestVersion = (data.latestVersion || currentVersion).replace(/^v/, '').trim();
        // Always verify with client-side semantic comparison to eliminate infinite loops
        const isUpdateAvailable = this.compareVersions(latestVersion, currentVersion) > 0;
        const forceUpdate = isUpdateAvailable && !!data.forceUpdate;

        if (!isUpdateAvailable) {
          return null;
        }

        return {
          isUpdateAvailable,
          forceUpdate,
          currentVersion,
          latestVersion,
          downloadUrl:
            data.downloadUrl ||
            'https://github.com/roshanavatirak/Regent-Money/releases/latest/download/regent-money.apk',
          releaseNotes: Array.isArray(data.releaseNotes) && data.releaseNotes.length > 0
            ? data.releaseNotes
            : [
                'New Wealth Roadmap & Goal milestones',
                'Unified top navigation bar',
                'Design and speed enhancements',
              ],
        };
      }

      return null;
    } catch (e) {
      console.warn('[UpdateService] Update check failed:', e);
      return null;
    }
  }

  /**
   * Downloads APK silently inside the app with a live progress bar,
   * then launches the native Android installer dialog directly.
   * The user never leaves the app or visits any website.
   */
  async downloadAndInstallApk(
    downloadUrl: string,
    onProgress: (percent: number, loadedMB: string, totalMB: string) => void
  ): Promise<boolean> {
    try {
      if (Platform.OS !== 'android') {
        return this.startInstall(downloadUrl);
      }

      const fileUri = `${FileSystem.documentDirectory}regent-money-update.apk`;

      // Clean previous temp download
      try {
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        }
      } catch (cleanErr) {
        // Continue
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        fileUri,
        {},
        (downloadProgress) => {
          const written = downloadProgress.totalBytesWritten;
          const total = downloadProgress.totalBytesExpectedToWrite;
          const percent = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
          const loadedMB = (written / (1024 * 1024)).toFixed(1);
          const totalMB = total > 0 ? (total / (1024 * 1024)).toFixed(1) : '...';
          onProgress(percent, loadedMB, totalMB);
        }
      );

      const downloadResult = await downloadResumable.downloadAsync();
      if (!downloadResult || !downloadResult.uri) {
        throw new Error('Download failed to produce APK file.');
      }

      // Convert file URI to Android content URI
      const contentUri = await FileSystem.getContentUriAsync(downloadResult.uri);

      // Trigger native Android package installer
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
      });

      return true;
    } catch (err) {
      console.warn('[UpdateService] In-app install error, falling back to direct browser download:', err);
      return this.startInstall(downloadUrl);
    }
  }

  /**
   * Fallback direct download launcher
   */
  async startInstall(downloadUrl: string): Promise<boolean> {
    try {
      const supported = await Linking.canOpenURL(downloadUrl);
      if (supported) {
        await Linking.openURL(downloadUrl);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[UpdateService] Error launching download URL:', err);
      return false;
    }
  }
}

export const updateService = new UpdateService();
