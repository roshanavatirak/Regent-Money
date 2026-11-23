/**
 * Turns a phone number into the 10 digits the sign-up mobile field takes.
 * Handles "+91 79728 83376", "917972883376" and the "079728 83376" form Google's phone number
 * sheet sometimes shows; null for anything that is not an Indian mobile number.
 */
export function toIndianMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}
