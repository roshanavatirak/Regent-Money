import { SetMetadata } from '@nestjs/common';

export const ALLOW_INGEST_TOKEN = 'auth:allowIngestToken';

/**
 * Marks a route that the Android background SMS worker may call with its long-lived,
 * SMS-only token. Every other route refuses that token.
 */
export const AllowIngestToken = () => SetMetadata(ALLOW_INGEST_TOKEN, true);
