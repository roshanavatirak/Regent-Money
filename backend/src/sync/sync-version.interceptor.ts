import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { SyncService } from './sync.service';

/**
 * After any successful write to /sync (POST, PATCH, PUT, DELETE), brings the Cash wallet in line
 * with tagged ATM withdrawals (see cash-wallet-topups.ts), then bumps the user's sync version
 * before the response is sent. That way every change is covered, including write paths that
 * don't call invalidateUserSyncCache themselves, and a phone that syncs right after saving
 * never gets "304 nothing changed" for data it just wrote.
 */
@Injectable()
export class SyncVersionInterceptor implements NestInterceptor {
  constructor(private readonly syncService: SyncService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const isWrite = req?.method && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    const userId: string | undefined = req?.user?.id;

    if (!isWrite) return next.handle();

    return next.handle().pipe(
      mergeMap((body) =>
        from(
          (async () => {
            // req.user is set by the guard, which runs before this handler
            const id = userId ?? req?.user?.id;
            if (id) {
              // Before the version bump, so the phone's next sync already has the new cash balance
              await this.syncService.reconcileCashWithdrawals(id);
              await this.syncService.bumpSyncVersion(id);
            }
            return body;
          })(),
        ),
      ),
    );
  }
}
