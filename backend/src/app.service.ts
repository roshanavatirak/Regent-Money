import { Injectable, Logger } from '@nestjs/common';

export interface AppVersionResponse {
  isUpdateAvailable: boolean;
  forceUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string[];
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getHello(): string {
    return 'Regent Money Backend API';
  }

  /**
   * Safe Semantic Version comparator
   * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
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
   * App version check - Controlled SOLELY by Render Environment Variables:
   * - LATEST_APP_VERSION: Target latest version (e.g. "1.0.0")
   * - MIN_SUPPORTED_VERSION: Below this, forceUpdate is true (e.g. "1.0.0")
   * - APK_DOWNLOAD_URL: Optional direct download URL override
   */
  async checkAppVersion(
    platform: string = 'android',
    currentVersion: string = '',
  ): Promise<AppVersionResponse> {
    const safeCurrentVersion = (currentVersion || '').trim();

    // Render environment variables are the sole single source of truth
    const latestVersion = (process.env.LATEST_APP_VERSION || safeCurrentVersion).replace(/^v/, '').trim();
    const minSupported = (process.env.MIN_SUPPORTED_VERSION || safeCurrentVersion).replace(/^v/, '').trim();
    const downloadUrl =
      process.env.APK_DOWNLOAD_URL ||
      'https://github.com/roshanavatirak/Regent-Money/releases/latest/download/regent-money.apk';

    const releaseNotes = [
      'New Wealth Roadmap & Goal milestones',
      'Unified top navigation bar',
      'Design & performance refinements',
    ];

    const isUpdateAvailable =
      !!latestVersion &&
      !!safeCurrentVersion &&
      this.compareVersions(latestVersion, safeCurrentVersion) > 0;

    const forceUpdate =
      isUpdateAvailable &&
      !!minSupported &&
      this.compareVersions(minSupported, safeCurrentVersion) > 0;

    return {
      isUpdateAvailable,
      forceUpdate,
      currentVersion: safeCurrentVersion,
      latestVersion,
      downloadUrl,
      releaseNotes,
    };
  }
}

