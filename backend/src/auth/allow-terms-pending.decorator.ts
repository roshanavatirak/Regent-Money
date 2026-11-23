import { SetMetadata } from '@nestjs/common';

export const ALLOW_TERMS_PENDING = 'allowTermsPending';

/**
 * Lets an account that hasn't accepted the Terms yet call this route. Everything else answers
 * 403 TERMS_REQUIRED until it does. Only for what the Terms screen needs: reading the profile,
 * accepting, and logging out.
 */
export const AllowTermsPending = () => SetMetadata(ALLOW_TERMS_PENDING, true);
