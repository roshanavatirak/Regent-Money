import { getBackendUrl } from '../config/api';
import { tokenStore } from './tokenStore';
import { authService } from './authService';
import { showGlobalAlert } from '../store';

let isHandlingKickout = false;

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getBackendUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const token = tokenStore.getAccessToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 403 || response.status === 401) {
    try {
      const clone = response.clone();
      const data = await clone.json().catch(() => ({}));

      if (data.code === 'USER_BANNED' || data.code === 'ACCOUNT_DELETED') {
        if (!isHandlingKickout) {
          isHandlingKickout = true;
          try {
            await authService.logOut();
            showGlobalAlert(
              data.code === 'USER_BANNED' ? 'Account Suspended' : 'Account Removed',
              data.message || 'Your account access has been revoked. Please contact support.',
              () => {
                isHandlingKickout = false;
              },
            );
          } catch (logoutErr) {
            isHandlingKickout = false;
          }
        }
      }
    } catch {}
  }

  return response;
}
