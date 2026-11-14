import { EmailAccountsService, PRIMARY_RESERVE } from './email-accounts.service';

/** Builds the service with fake config and a fake DB that reports today's usage per account. */
function build(opts: {
  primarySent?: number;
  broadcastSent?: number;
  fallback?: boolean | null; // null = no row stored (default on)
  broadcastKey?: string | null;
  welcomeSent?: number;
  welcomeKey?: string | null;
}) {
  const env: Record<string, string | null> = {
    BREVO_API_KEY: 'primary_key_1234567890',
    BREVO_SENDER_EMAIL: 'auth@example.com',
    BREVO_BROADCAST_API_KEY: opts.broadcastKey === undefined ? 'broadcast_key_1234567890' : opts.broadcastKey,
    BREVO_BROADCAST_SENDER_EMAIL: 'news@example.com',
    BREVO_WELCOME_API_KEY: opts.welcomeKey === undefined ? null : opts.welcomeKey,
    BREVO_WELCOME_SENDER_EMAIL: 'hello@example.com',
  };
  const configService: any = { get: jest.fn((k: string) => env[k] ?? null) };
  const dataSource: any = {
    query: jest.fn(async (q: string) => {
      if (q.includes('FROM core.auth_email_logs'))
        return [
          { account: 'primary', is_welcome: false, n: opts.primarySent ?? 0 },
          { account: 'welcome', is_welcome: true, n: opts.welcomeSent ?? 0 },
        ];
      if (q.includes('FROM core.email_recipients')) return [{ account: 'broadcast', n: opts.broadcastSent ?? 0 }];
      if (q.includes('FROM core.email_settings')) return opts.fallback === null || opts.fallback === undefined ? [] : [{ value: opts.fallback }];
      return [];
    }),
  };
  return new EmailAccountsService(configService, dataSource);
}

/** Fake Brevo: answers per API key. */
function mockBrevo(byKey: Record<string, number>) {
  const calls: string[] = [];
  (global as any).fetch = jest.fn(async (_url: string, init: any) => {
    const key = init.headers['api-key'];
    calls.push(key);
    const status = byKey[key] ?? 201;
    return {
      ok: status < 300,
      status,
      json: async () => ({ messageId: 'm1' }),
      text: async () => 'err',
    };
  });
  return calls;
}

const mail = { toEmail: 'u@example.com', subject: 'S', htmlContent: '<p>x</p>' };

describe('EmailAccountsService fallback', () => {
  afterEach(() => {
    delete (global as any).fetch;
  });

  it('sends sign-in mail from the primary account when it has room', async () => {
    const calls = mockBrevo({});
    const res = await build({ primarySent: 10 }).sendAuthEmail(mail);
    expect(res.success).toBe(true);
    expect(res.account).toBe('primary');
    expect(calls).toEqual(['primary_key_1234567890']);
  });

  it('uses the broadcast account for sign-in mail when primary is full (fallback on by default)', async () => {
    const calls = mockBrevo({});
    const res = await build({ primarySent: 300 }).sendAuthEmail(mail);
    expect(res.account).toBe('broadcast');
    expect(calls).toEqual(['broadcast_key_1234567890']);
  });

  it('retries on the broadcast account when Brevo says primary is full', async () => {
    const calls = mockBrevo({ primary_key_1234567890: 402 });
    const res = await build({ primarySent: 5 }).sendAuthEmail(mail);
    expect(res.success).toBe(true);
    expect(res.account).toBe('broadcast');
    expect(calls).toEqual(['primary_key_1234567890', 'broadcast_key_1234567890']);
  });

  it('never borrows when the admin turned fallback off', async () => {
    const calls = mockBrevo({ primary_key_1234567890: 402 });
    const res = await build({ primarySent: 300, fallback: false }).sendAuthEmail(mail);
    expect(res.success).toBe(false);
    expect(res.account).toBe('primary');
    expect(calls).toEqual(['primary_key_1234567890']);
  });

  it('lets broadcasts borrow from primary only down to the sign-in reserve', async () => {
    const cap = await build({ primarySent: 40, broadcastSent: 300 }).getBroadcastCapacity();
    expect(cap.own).toBe(0);
    expect(cap.borrowable).toBe(300 - 40 - PRIMARY_RESERVE);
    expect(PRIMARY_RESERVE).toBe(200);
  });

  it('gives broadcasts nothing extra when fallback is off', async () => {
    const cap = await build({ primarySent: 0, broadcastSent: 300, fallback: false }).getBroadcastCapacity();
    expect(cap).toEqual({ own: 0, borrowable: 0 });
  });

  it('reads the footer links from core.email_settings and ignores non-https values', async () => {
    const svc = build({});
    (svc as any).dataSource.query = jest.fn(async () => [
      { key: 'legal_terms_url', value: 'https://raodevstudios.in/terms' },
      { key: 'legal_privacy_url', value: 'javascript:alert(1)' },
    ]);
    expect(await svc.getLegalLinks()).toEqual({ termsUrl: 'https://raodevstudios.in/terms', privacyUrl: null });
  });

  it('falls back to the RAO Dev Studios links when the table is missing', async () => {
    const svc = build({});
    (svc as any).dataSource.query = jest.fn(async () => {
      throw new Error('relation does not exist');
    });
    expect(await svc.getLegalLinks()).toEqual({
      termsUrl: 'https://raodevstudios.in/terms',
      privacyUrl: 'https://raodevstudios.in/privacy',
    });
  });

  it('keeps 200 sign-in emails: no borrowing once primary has 200 or fewer left', async () => {
    const cap = await build({ primarySent: 100, broadcastSent: 300 }).getBroadcastCapacity();
    expect(cap).toEqual({ own: 0, borrowable: 0 });
  });

  it('chains broadcasts: broadcast -> welcome -> primary (spare only)', async () => {
    const chain = await build({ welcomeKey: 'welcome_key_1234567890', primarySent: 0, broadcastSent: 300, welcomeSent: 10 }).getChain('broadcast');
    expect(chain).toEqual([
      { account: 'welcome', left: 290 },
      { account: 'primary', left: 100 },
    ]);
  });

  it('chains welcome mail: welcome -> broadcast -> primary (spare only)', async () => {
    const chain = await build({ welcomeKey: 'welcome_key_1234567890', primarySent: 50, broadcastSent: 20, welcomeSent: 0 }).getChain('welcome');
    expect(chain).toEqual([
      { account: 'welcome', left: 300 },
      { account: 'broadcast', left: 280 },
      { account: 'primary', left: 50 },
    ]);
  });

  it('sends welcome mail through broadcast when Brevo says the welcome account is full', async () => {
    const calls = mockBrevo({ welcome_key_1234567890: 402 });
    const res = await build({ welcomeKey: 'welcome_key_1234567890' }).sendWithFallback('welcome', mail);
    expect(res.success).toBe(true);
    expect(res.account).toBe('broadcast');
    expect(calls).toEqual(['welcome_key_1234567890', 'broadcast_key_1234567890']);
  });

  it('reports a quota error when every account the welcome mail may use is full', async () => {
    const calls = mockBrevo({ welcome_key_1234567890: 402 });
    const res = await build({ welcomeKey: 'welcome_key_1234567890', welcomeSent: 300, broadcastSent: 300, primarySent: 150 }).sendWithFallback('welcome', mail);
    expect(res.success).toBe(false);
    expect(res.isQuotaError).toBe(true);
    expect(calls).toEqual(['welcome_key_1234567890']); // one probe of its own account, never the 200 sign-in reserve
  });

  it('uses the welcome account as the last fallback for sign-in mail', async () => {
    const calls = mockBrevo({ primary_key_1234567890: 402, broadcast_key_1234567890: 429 });
    const res = await build({ welcomeKey: 'welcome_key_1234567890' }).sendAuthEmail(mail);
    expect(res.success).toBe(true);
    expect(res.account).toBe('welcome');
    expect(calls).toEqual(['primary_key_1234567890', 'broadcast_key_1234567890', 'welcome_key_1234567890']);
  });

  it('lets sign-in mail use the whole primary account (no reserve for itself)', async () => {
    const chain = await build({ primarySent: 299 }).getChain('auth');
    expect(chain[0]).toEqual({ account: 'primary', left: 1 });
  });

  it('counts an account that shares another account API key only once', async () => {
    const chain = await build({ welcomeKey: 'broadcast_key_1234567890' }).getChain('welcome');
    expect(chain.map((s) => s.account)).toEqual(['welcome', 'primary']);
  });

  it('does not treat a missing broadcast account as a second account', async () => {
    const svc = build({ broadcastKey: null });
    expect(svc.canFallBack()).toBe(false);
  });
});
