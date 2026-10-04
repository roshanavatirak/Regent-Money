import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';

export class UploadError extends Error {
  constructor(message: string, public status?: number, public body?: any) {
    super(message);
    this.name = 'UploadError';
  }
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

type UploadArgs = {
  url: string;
  fileUri: string;
  fileName?: string;
  webFile?: Blob;
  fieldName?: string;
  fields?: Record<string, string | undefined | null>;
  headers?: Record<string, string>;
  maxBytes?: number;
  timeoutMs?: number;
};

function extractMessage(json: any, status: number): string {
  const m = json?.message;
  if (Array.isArray(m)) return m.join('\n');
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object') return m.message || m.error || `Upload failed (${status}).`;
  return json?.error || `Upload failed (${status}).`;
}

async function resolveFilePart(
  fileUri: string,
  fileName: string,
  maxBytes: number,
  tooBig: string,
): Promise<{ part: Blob | File; name?: string }> {
  let nativeFile: File | null = null;
  try {
    const f = new File(fileUri);
    if (f.exists) nativeFile = f;
  } catch {
    // Unsupported URI scheme (e.g. content://); use the blob fallback below.
  }

  if (nativeFile) {
    if (nativeFile.size > maxBytes) throw new UploadError(tooBig);
    return { part: nativeFile };
  }

  let blob: Blob;
  try {
    blob = await (await fetch(fileUri)).blob();
  } catch {
    throw new UploadError('Selected file is no longer available.');
  }
  if (blob.size > maxBytes) throw new UploadError(tooBig);
  return { part: blob, name: fileName };
}

export async function uploadFile({
  url,
  fileUri,
  fileName = 'upload',
  webFile,
  fieldName = 'file',
  fields = {},
  headers = {},
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: UploadArgs) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v != null) form.append(k, v);
  }

  const tooBig = `File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`;
  if (Platform.OS === 'web' && webFile) {
    if (webFile.size > maxBytes) throw new UploadError(tooBig);
    form.append(fieldName, webFile);
  } else {
    const { part, name } = await resolveFilePart(fileUri, fileName, maxBytes, tooBig);
    if (name) {
      form.append(fieldName, part, name);
    } else {
      form.append(fieldName, part);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new UploadError(extractMessage(json, res.status), res.status, json);
    return json;
  } catch (e: any) {
    if (e instanceof UploadError) throw e;
    if (e?.name === 'AbortError') throw new UploadError('Upload timed out. Please try again.');
    throw new UploadError('Network error. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}

export const isPasswordRequired = (body: any) =>
  body?.error === 'PASSWORD_REQUIRED' ||
  body?.error === 'INVALID_PASSWORD' ||
  body?.message?.error === 'PASSWORD_REQUIRED' ||
  body?.message?.error === 'INVALID_PASSWORD' ||
  body?.message === 'PASSWORD_REQUIRED' ||
  body?.message === 'INVALID_PASSWORD';

export const isInvalidPassword = (body: any) =>
  body?.error === 'INVALID_PASSWORD' ||
  body?.message?.error === 'INVALID_PASSWORD' ||
  body?.message === 'INVALID_PASSWORD';
