import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { timingSafeEqual } from 'crypto';
import { ANDROID_PACKAGE } from './referrer';
import type { IntegrityMode, IntegrityResult } from './claim-rules';

/** How old a Play Integrity token may be when we check it. */
export const INTEGRITY_MAX_AGE_MS = 10 * 60 * 1000;

export interface VerdictExpectation {
  packageName: string;
  requestHash: string;
  now: number;
  /** Optional allow-list of app signing certificate digests (base64url SHA-256). */
  certDigests?: string[];
}

const sameText = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Checks Google's decoded verdict against what this claim must look like.
 * Returns null when everything matches, otherwise a short reason for the admin log.
 * Pure, so the rules are unit tested without calling Google.
 */
export const verdictProblem = (payload: any, expect: VerdictExpectation): string | null => {
  const request = payload?.requestDetails;
  if (!request) return 'no_request_details';
  if (request.requestPackageName !== expect.packageName) return 'wrong_package';
  if (typeof request.requestHash !== 'string' || !sameText(request.requestHash, expect.requestHash)) {
    return 'hash_mismatch';
  }
  const issuedAt = Number(request.timestampMillis);
  if (!Number.isFinite(issuedAt) || Math.abs(expect.now - issuedAt) > INTEGRITY_MAX_AGE_MS) return 'stale_token';

  const app = payload?.appIntegrity;
  // UNEVALUATED is also what Google returns when a token is decoded a second time (replay).
  if (app?.appRecognitionVerdict !== 'PLAY_RECOGNIZED') return 'app_not_recognized';
  if (app.packageName !== expect.packageName) return 'wrong_app_package';
  if (expect.certDigests?.length) {
    const digests: string[] = Array.isArray(app.certificateSha256Digest) ? app.certificateSha256Digest : [];
    if (!digests.some((d) => expect.certDigests!.includes(d))) return 'wrong_certificate';
  }

  const device: string[] = Array.isArray(payload?.deviceIntegrity?.deviceRecognitionVerdict)
    ? payload.deviceIntegrity.deviceRecognitionVerdict
    : [];
  if (!device.includes('MEETS_DEVICE_INTEGRITY')) return 'device_not_genuine';

  if (payload?.accountDetails?.appLicensingVerdict !== 'LICENSED') return 'not_installed_from_play';
  return null;
};

/**
 * Asks Google to decode a Play Integrity token and judges the result.
 *
 * Setup (see backend/.env.example): PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER and
 * PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON. Until both are set, link claims are stored as
 * "unverified" and never counted, so nothing can be faked while it is off.
 */
@Injectable()
export class PlayIntegrityService {
  private readonly logger = new Logger(PlayIntegrityService.name);
  private auth: GoogleAuth | null = null;

  constructor(private readonly config: ConfigService) {}

  get cloudProjectNumber(): string | null {
    const value = (this.config.get<string>('PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER') || '').trim();
    return /^\d{6,20}$/.test(value) ? value : null;
  }

  get isConfigured(): boolean {
    return !!this.cloudProjectNumber && !!(this.config.get<string>('PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON') || '').trim();
  }

  /** Checks can only be switched off outside production (local development, emulators). */
  get mode(): IntegrityMode {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const wanted = (this.config.get<string>('ATTRIBUTION_INTEGRITY_MODE') || 'enforce').trim().toLowerCase();
    return !isProd && wanted === 'off' ? 'off' : 'enforce';
  }

  private get certDigests(): string[] {
    return (this.config.get<string>('PLAY_INTEGRITY_CERT_SHA256') || '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
  }

  private client(): GoogleAuth {
    if (!this.auth) {
      const credentials = JSON.parse(this.config.get<string>('PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON') as string);
      this.auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/playintegrity'] });
    }
    return this.auth;
  }

  async verify(token: unknown, requestHash: string): Promise<{ result: IntegrityResult; detail: string | null }> {
    if (typeof token !== 'string' || token.length < 20 || token.length > 20000) {
      return { result: 'unavailable', detail: 'no_token' };
    }
    if (!this.isConfigured) return { result: 'unavailable', detail: 'not_configured' };

    let payload: any;
    try {
      const client = await this.client().getClient();
      const response = await client.request<any>({
        url: `https://playintegrity.googleapis.com/v1/${ANDROID_PACKAGE}:decodeIntegrityToken`,
        method: 'POST',
        data: { integrity_token: token },
        timeout: 10_000,
      });
      payload = response.data?.tokenPayloadExternal;
    } catch (err: any) {
      const status = err?.response?.status;
      // 400 means Google could not read the token at all: it was not made by our app.
      if (status === 400) return { result: 'failed', detail: 'undecodable_token' };
      this.logger.warn(`Play Integrity decode failed (${status ?? err?.code ?? 'network'}).`);
      return { result: 'unavailable', detail: 'google_unreachable' };
    }

    const problem = verdictProblem(payload, {
      packageName: ANDROID_PACKAGE,
      requestHash,
      now: Date.now(),
      certDigests: this.certDigests,
    });
    return problem ? { result: 'failed', detail: problem } : { result: 'passed', detail: null };
  }
}
