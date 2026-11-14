import { ConfigService } from '@nestjs/config';
import { AiService, classifyProviderStatus, istDay, parseJsonAnswer } from './ai.service';

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

describe('Scan fallback (statements and screenshots)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  const SCAN_KEYS = { GEMINI_API_KEY: 'g1', GEMINI_API_KEY_2: 'g2', GROQ_API_KEY_2: 'q2' };
  const statementJson = JSON.stringify({
    isValid: true,
    rejectionReason: null,
    finalDetectedBalance: 900,
    transactions: [{ date: '2026-10-01', amount: 100, type: 'debit', merchant: 'Swiggy', balanceAfter: 900 }],
  });
  const imageJson = JSON.stringify({
    isValid: true,
    category: 'transaction_screenshot',
    rejectionReason: null,
    transactions: [{ date: '2026-10-01', amount: 349, type: 'debit', merchant: 'Swiggy' }],
  });

  type Name = 'gemini1' | 'gemini2' | 'groq';
  const route = (handlers: Partial<Record<Name, () => any>>) => {
    const calls: Name[] = [];
    const bodies: any[] = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      const u = String(url);
      const name: Name = u.includes('groq') ? 'groq' : u.includes('key=g2') ? 'gemini2' : 'gemini1';
      calls.push(name);
      bodies.push(JSON.parse(init.body));
      const h = handlers[name];
      if (!h) throw new Error(`unexpected call to ${name}`);
      return h();
    }) as any;
    return { calls, bodies };
  };

  it('uses only the main Gemini key when it answers', async () => {
    const { calls } = route({ gemini1: () => gemini(statementJson) });
    const res = await new AiService(config(SCAN_KEYS)).parseStatementText('01/10 SWIGGY 100.00 DR 900.00');
    expect(res.isValid).toBe(true);
    expect(res.transactions[0].merchant).toBe('Swiggy');
    expect(calls).toEqual(['gemini1']);
  });

  it('tries Gemini key 2, then Groq, for a statement', async () => {
    const { calls, bodies } = route({
      gemini1: () => errStatus(429),
      gemini2: () => errStatus(503),
      groq: () => openAi(statementJson),
    });
    const res = await new AiService(config(SCAN_KEYS)).parseStatementText('01/10 SWIGGY 100.00 DR 900.00');
    expect(res.isValid).toBe(true);
    expect(res.finalDetectedBalance).toBe(900);
    expect(calls).toEqual(['gemini1', 'gemini2', 'groq']);
    // Groq gets the same instructions, as a JSON request, on the text model
    expect(bodies[2].model).toBe('openai/gpt-oss-120b');
    expect(bodies[2].response_format).toEqual({ type: 'json_object' });
    expect(bodies[2].messages[0].content).toContain('expert financial document parser');
  });

  it('sends a screenshot to Groq as an image on the vision model', async () => {
    const { calls, bodies } = route({
      gemini1: () => errStatus(500),
      gemini2: () => errStatus(500),
      groq: () => openAi(imageJson),
    });
    const res = await new AiService(config(SCAN_KEYS)).parseImageOcr(Buffer.from('img'), 'image/png');
    expect(res.isValid).toBe(true);
    expect(res.transactions[0].amount).toBe(349);
    expect(calls).toEqual(['gemini1', 'gemini2', 'groq']);
    expect(bodies[2].model).toBe('qwen/qwen3.8-27b');
    const image = bodies[2].messages[1].content.find((c: any) => c.type === 'image_url');
    expect(image.image_url.url).toBe(`data:image/png;base64,${Buffer.from('img').toString('base64')}`);
  });

  it('keeps going after a rejected request (Gemini answers a bad key with 400)', async () => {
    const { calls } = route({ gemini1: () => errStatus(400), gemini2: () => gemini(imageJson) });
    const res = await new AiService(config(SCAN_KEYS)).parseImageOcr(Buffer.from('img'));
    expect(res.isValid).toBe(true);
    expect(calls).toEqual(['gemini1', 'gemini2']);
  });

  it('moves on when an AI returns text that is not JSON', async () => {
    const { calls } = route({ gemini1: () => gemini('Sorry, I cannot help'), gemini2: () => gemini(statementJson) });
    const res = await new AiService(config(SCAN_KEYS)).parseStatementText('statement');
    expect(res.isValid).toBe(true);
    expect(calls).toEqual(['gemini1', 'gemini2']);
  });

  it('rests a rate-limited key, so the next scan skips it', async () => {
    const service = new AiService(config(SCAN_KEYS));
    route({ gemini1: () => errStatus(429), gemini2: () => gemini(statementJson) });
    await service.parseStatementText('statement');
    const { calls } = route({ gemini2: () => gemini(statementJson) });
    await service.parseStatementText('statement');
    expect(calls).toEqual(['gemini2']);
  });

  it('gives the same answers as before when every AI fails', async () => {
    route({ gemini1: () => errStatus(500), gemini2: () => errStatus(500), groq: () => errStatus(500) });
    const service = new AiService(config(SCAN_KEYS));
    const image = await service.parseImageOcr(Buffer.from('img'));
    expect(image.isValid).toBe(false);
    expect(image.rejectionReason).toBe('Unable to analyze image at this time. Please ensure the image is clear and try again.');
    route({});
    const statement = await new AiService(config(SCAN_KEYS)).parseStatementText('statement');
    expect(statement.isValid).toBe(false);
    expect(statement.rejectionReason).toBe('Unable to parse statement text.');
  });

  it('uses the chat Groq key for scans when no second Groq key is set', async () => {
    const { calls } = route({ gemini1: () => errStatus(500), groq: () => openAi(statementJson) });
    const res = await new AiService(config({ GEMINI_API_KEY: 'g1', GROQ_API_KEY: 'q1' })).parseStatementText('s');
    expect(res.isValid).toBe(true);
    expect(calls).toEqual(['gemini1', 'groq']);
  });

  it('stops trying when the time budget is used up', async () => {
    const { calls } = route({});
    const res = await new AiService(config(SCAN_KEYS)).scanWithFallback({ kind: 'text', system: 's', prompt: 'p' }, 4000);
    expect(res).toBeNull();
    expect(calls).toEqual([]);
  });

  it('refuses a screenshot when no AI key is set at all', async () => {
    await expect(new AiService(config({})).parseImageOcr(Buffer.from('img'))).rejects.toThrow('No AI key');
  });
});

describe('parseJsonAnswer', () => {
  it('reads plain JSON, fenced JSON, thinking tags and JSON with a sentence around it', () => {
    expect(parseJsonAnswer('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonAnswer('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonAnswer('<think>let me see {x}</think>{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonAnswer('Here you go: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } });
    expect(parseJsonAnswer('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('returns null when there is no JSON', () => {
    expect(parseJsonAnswer('no json here')).toBeNull();
    expect(parseJsonAnswer('')).toBeNull();
    expect(parseJsonAnswer('"just a string"')).toBeNull();
  });
});
