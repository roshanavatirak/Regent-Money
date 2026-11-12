import { ConfigService } from '@nestjs/config';
import { AiService, classifyProviderStatus, istDay } from './ai.service';

const config = (values: Record<string, string | undefined>) =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

const okJson = (body: any) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
const errStatus = (status: number) =>
  ({ ok: false, status, json: async () => ({}), text: async () => `error ${status}` }) as unknown as Response;
const openAi = (text: string) => okJson({ choices: [{ message: { content: text } }] });
const gemini = (text: string) => okJson({ candidates: [{ content: { parts: [{ text }] } }] });

const KEYS = { GROQ_API_KEY: 'g', MISTRAL_API_KEY: 'm', GEMINI_API_KEY: 'x' };
const ask = { question: 'How much did I spend?', history: [], context: { user: { name: 'Asha' }, totalBalance: 100 } } as any;

describe('AI provider failover', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  const route = (handlers: { groq?: () => any; mistral?: () => any; gemini?: () => any }) => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: any) => {
      const u = String(url);
      const name = u.includes('groq') ? 'groq' : u.includes('mistral') ? 'mistral' : 'gemini';
      calls.push(name);
      const h = (handlers as any)[name];
      if (!h) throw new Error(`unexpected call to ${name}`);
      return h();
    }) as any;
    return calls;
  };

  it('sorts provider errors into retry, retry-and-rest, or stop', () => {
    expect(classifyProviderStatus(429)).toBe('next-cooldown');
    expect(classifyProviderStatus(503)).toBe('next-cooldown');
    expect(classifyProviderStatus(401)).toBe('next');
    expect(classifyProviderStatus(404)).toBe('next');
    expect(classifyProviderStatus(400)).toBe('stop');
    expect(classifyProviderStatus(413)).toBe('stop');
  });

  it('uses only the first provider when it answers', async () => {
    const calls = route({ groq: () => openAi('From Groq') });
    const res = await new AiService(config(KEYS)).chat(ask);
    expect(res.answer).toBe('From Groq');
    expect(calls).toEqual(['groq']);
  });

  it('moves to the next provider on a rate limit and rests the first one', async () => {
    const service = new AiService(config(KEYS));
    let calls = route({ groq: () => errStatus(429), mistral: () => openAi('From Mistral') });
    expect((await service.chat(ask)).answer).toBe('From Mistral');
    expect(calls).toEqual(['groq', 'mistral']);

    // Within the minute, Groq is skipped without a call
    calls = route({ mistral: () => openAi('Mistral again') });
    expect((await service.chat(ask)).answer).toBe('Mistral again');
    expect(calls).toEqual(['mistral']);
  });

  it('stops on a rejected request instead of trying every provider', async () => {
    const calls = route({ groq: () => errStatus(400) });
    const res = await new AiService(config(KEYS)).chat(ask);
    expect(res.model).toBe('system/request-rejected');
    expect(calls).toEqual(['groq']);
  });

  it('treats a timeout or network error as an outage and moves on', async () => {
    const calls = route({
      groq: () => {
        const e = new Error('timed out');
        e.name = 'TimeoutError';
        throw e;
      },
      mistral: () => errStatus(503),
      gemini: () => gemini('From Gemini'),
    });
    const res = await new AiService(config(KEYS)).chat(ask);
    expect(res.answer).toBe('From Gemini');
    expect(calls).toEqual(['groq', 'mistral', 'gemini']);
  });

  it('passes a timeout signal to every provider call', async () => {
    const signals: any[] = [];
    global.fetch = jest.fn(async (_url: any, init: any) => {
      signals.push(init?.signal);
      return openAi('ok');
    }) as any;
    await new AiService(config(KEYS)).chat(ask);
    expect(signals[0]).toBeDefined();
  });

  it('falls back to the offline message when every provider fails', async () => {
    route({ groq: () => errStatus(500), mistral: () => errStatus(500), gemini: () => errStatus(500) });
    const res = await new AiService(config(KEYS)).chat(ask);
    expect(res.model).toBe('system/offline-fallback');
  });
});

describe('AI daily question limit', () => {
  it('counts questions per user per day in Redis and stops after the limit', async () => {
    const counts = new Map<string, number>();
    const redis = {
      executeCommand: jest.fn(async ([cmd, key]: any[]) => {
        if (cmd === 'INCR') {
          counts.set(key, (counts.get(key) || 0) + 1);
          return counts.get(key);
        }
        return 1;
      }),
    } as any;
    const service = new AiService(config({ AI_DAILY_LIMIT: '3' }), redis);

    const results: { allowed: boolean; used: number; limit: number }[] = [];
    for (let i = 0; i < 4; i++) results.push(await service.consumeDailyQuota('user_1'));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].limit).toBe(3);
    // Expiry is set once, on the first question of the day
    expect(redis.executeCommand.mock.calls.filter((c: any[]) => c[0][0] === 'EXPIRE')).toHaveLength(1);
    // Other users have their own count
    expect((await service.consumeDailyQuota('user_2')).allowed).toBe(true);
  });

  it('still limits when Redis is unavailable', async () => {
    const redis = { executeCommand: jest.fn(async () => null) } as any;
    const service = new AiService(config({ AI_DAILY_LIMIT: '2' }), redis);
    const allowed: boolean[] = [];
    for (let i = 0; i < 3; i++) allowed.push((await service.consumeDailyQuota('u')).allowed);
    expect(allowed).toEqual([true, true, false]);
  });

  it('defaults to 40 questions a day', async () => {
    const service = new AiService(config({}));
    const r = await service.consumeDailyQuota('u');
    expect(r.limit).toBe(40);
  });

  it('resets at midnight India time', () => {
    // 18:29 UTC = 23:59 IST (same day); 18:31 UTC = 00:01 IST (next day)
    expect(istDay(Date.UTC(2026, 10, 10, 18, 29))).toBe('2026-11-10');
    expect(istDay(Date.UTC(2026, 10, 10, 18, 31))).toBe('2026-11-11');
  });
});
