const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '55231273460-epfomp35a43c6d15bhilb92i6btl6jt9.apps.googleusercontent.com';

export const getGoogleWebClientId = (): string => {
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || DEFAULT_GOOGLE_WEB_CLIENT_ID;
};
