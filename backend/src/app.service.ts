import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface ReleaseNoteItem {
  title: string;
  detail?: string;
}

export interface AppVersionResponse {
  isUpdateAvailable: boolean;
  forceUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: (string | ReleaseNoteItem)[];
}

/** Read on every version check, so editing the file is enough; no code change or rebuild. */
function readReleaseNotes(): { title: string; detail?: string }[] {
  try {
    const candidates = [
      path.join(process.cwd(), 'release-notes.json'),
      path.join(process.cwd(), 'backend', 'release-notes.json'),
      path.join(__dirname, '..', 'release-notes.json'),
    ];
    const file = candidates.find((p) => fs.existsSync(p)) || candidates[0];
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(json?.notes)) return [];
    return json.notes
      .map((n: any) => {
        if (typeof n === 'string') {
          const i = n.indexOf(':');
          return i > 0 ? { title: n.slice(0, i).trim(), detail: n.slice(i + 1).trim() } : { title: n.trim() };
        }
        if (n && typeof n === 'object' && typeof n.title === 'string') {
          return {
            title: n.title.trim(),
            detail: typeof n.detail === 'string' ? n.detail.trim() : undefined,
          };
        }
        return null;
      })
      .filter((n: any): n is { title: string; detail?: string } => !!n && !!n.title);
  } catch {
    return []; // No file or bad JSON: the app simply hides "What's new"
  }
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

    const rawNotes = readReleaseNotes();

    // Backward compatibility:
    // Versions prior to 1.0.47 (e.g. 1.0.46) rendered `note` directly inside `<Text>{note}</Text>`.
    // If the server returns objects with {title, detail}, React in those older clients throws:
    // "Objects are not valid as a React child (found: object with keys {title, detail})"
    // which crashes the app into ErrorBoundary on startup.
    // For clients < 1.0.47 (or if currentVersion is unknown), format each note as a string: "Title: Detail".
    const supportsObjectNotes = !!safeCurrentVersion && this.compareVersions(safeCurrentVersion, '1.0.47') >= 0;
    const releaseNotes: (string | ReleaseNoteItem)[] = supportsObjectNotes
      ? rawNotes
      : rawNotes.map((n) => (n.detail ? `${n.title}: ${n.detail}` : n.title));

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

