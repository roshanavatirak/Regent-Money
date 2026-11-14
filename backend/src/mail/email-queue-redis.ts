/**
 * Minimal client for the dedicated email-queue Upstash Redis (REST API).
 * Kept separate from RedisService, which talks to the app's main Redis.
 * Every call is one HTTPS request; nothing polls.
 */
export class EmailQueueRedis {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  static fromEnv(get: (k: string) => string | undefined): EmailQueueRedis | null {
    const clean = (v?: string) => (v || '').replace(/^["']|["']$/g, '').trim();
    const url = clean(get('EMAIL_QUEUE_REDIS_REST_URL')).replace(/\/+$/, '');
    const token = clean(get('EMAIL_QUEUE_REDIS_REST_TOKEN'));
    return url && token ? new EmailQueueRedis(url, token) : null;
  }

  async cmd<T = any>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args.map(String)),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new Error(`Email queue Redis ${args[0]} failed: ${json.error || res.status}`);
    return json.result as T;
  }
}
