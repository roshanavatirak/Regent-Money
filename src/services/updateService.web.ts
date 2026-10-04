import { Linking } from 'react-native';
import appConfig from '../../app.json';

export interface UpdateInfo {
  isUpdateAvailable: boolean;
  forceUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string[];
}

export const BASE_APP_VERSION = (appConfig?.expo?.version || '1.0.16').replace(/^v/, '').trim();

export const getAppCurrentVersion = (): string => {
  if (appConfig?.expo?.version) {
    return appConfig.expo.version.replace(/^v/, '').trim();
  }
  return BASE_APP_VERSION;
};

export const APP_CURRENT_VERSION = getAppCurrentVersion();

class UpdateService {
  async checkForUpdates(): Promise<UpdateInfo | null> {
    // Web clients always run the latest deployed bundle directly in the browser
    return null;
  }

  async installApk(_fileUri: string): Promise<boolean> {
    return false;
  }

  async downloadAndInstallApk(
    downloadUrl: string,
    _onProgress: (percent: number, loadedMB: string, totalMB: string) => void
  ): Promise<{ success: boolean; fileUri?: string; installerLaunched: boolean; error?: string }> {
    const opened = await this.startInstall(downloadUrl);
    return { success: opened, installerLaunched: opened };
  }

  async startInstall(downloadUrl: string): Promise<boolean> {
    try {
      await Linking.openURL(downloadUrl);
      return true;
    } catch (err) {
      console.error('[UpdateService] Error launching download URL:', err);
      return false;
    }
  }
}

export const updateService = new UpdateService();
