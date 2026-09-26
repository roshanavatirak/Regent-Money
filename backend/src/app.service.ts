import { Injectable, Logger } from '@nestjs/common';

export interface AppVersionResponse {
  isUpdateAvailable: boolean;
  forceUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string[];
  publishedAt?: string;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  // In-memory cache to prevent GitHub API rate limiting
  private cachedRelease: any = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

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

  async checkAppVersion(
    platform: string = 'android',
    currentVersion: string = '1.0.0',
  ): Promise<AppVersionResponse> {
    const now = Date.now();
    const repoOwner = 'roshanavatirak';
    const repoName = 'Regent-Money';
    const fallbackLatest = process.env.LATEST_APP_VERSION || '1.0.0';
    const minSupported = process.env.MIN_SUPPORTED_VERSION || '1.0.0';
    const directApkUrl = `https://github.com/${repoOwner}/${repoName}/releases/latest/download/regent-money.apk`;

    let releaseData = this.cachedRelease;

    if (!releaseData || now - this.lastFetchTime > this.CACHE_TTL_MS) {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`,
          {
            headers: {
              'User-Agent': 'Regent-Money-Updater',
              Accept: 'application/vnd.github.v3+json',
            },
          },
        );

        if (res.ok) {
          releaseData = await res.json();
          this.cachedRelease = releaseData;
          this.lastFetchTime = now;
        } else {
          this.logger.warn(
            `GitHub release fetch returned ${res.status}: ${res.statusText}`,
          );
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch GitHub release: ${err?.message || err}`);
      }
    }

    let latestTag = fallbackLatest;
    let apkDownloadUrl = directApkUrl;
    let notes: string[] = [
      'New Wealth Roadmap & Goal milestones',
      'Unified top navigation bar',
      'Design & performance refinements',
    ];
    let publishedAt: string | undefined = undefined;

    if (releaseData && releaseData.tag_name) {
      latestTag = releaseData.tag_name.replace(/^v/, '');
      publishedAt = releaseData.published_at;

      // Extract specific apk asset url if present
      if (Array.isArray(releaseData.assets)) {
        const apkAsset = releaseData.assets.find((a: any) =>
          a.name?.endsWith('.apk'),
        );
        if (apkAsset && apkAsset.browser_download_url) {
          apkDownloadUrl = apkAsset.browser_download_url;
        }
      }

      // Parse release notes from markdown body
      if (releaseData.body && typeof releaseData.body === 'string') {
        const lines = releaseData.body
          .split('\n')
          .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
          .filter(
            (l) =>
              l.length > 2 &&
              !l.startsWith('#') &&
              !l.startsWith('[') &&
              !l.startsWith('http'),
          );
        if (lines.length > 0) {
          notes = lines.slice(0, 4);
        }
      }
    }

    const isUpdateAvailable = this.compareVersions(latestTag, currentVersion) > 0;
    const forceUpdate =
      isUpdateAvailable &&
      this.compareVersions(minSupported, currentVersion) > 0;

    return {
      isUpdateAvailable,
      forceUpdate,
      currentVersion,
      latestVersion: latestTag,
      downloadUrl: apkDownloadUrl,
      releaseNotes: notes,
      publishedAt,
    };
  }
}
