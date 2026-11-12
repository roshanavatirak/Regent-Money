import { gunzipSync } from 'zlib';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { HomeCardsService } from './home-cards.service';
import {
  cardsForPhones,
  contrastRatio,
  validateCards,
} from './home-cards.schema';
import { DEFAULT_CARDS } from './home-cards.defaults';

const card = (over: Record<string, unknown> = {}) => ({
  ...DEFAULT_CARDS[5],
  ...over,
});

describe('validateCards', () => {
  it('accepts the default cards unchanged', () => {
    const { cards, errors } = validateCards(DEFAULT_CARDS);
    expect(errors).toEqual([]);
    expect(cards).toEqual(DEFAULT_CARDS);
  });

  it('reports every problem at once', () => {
    const { errors } = validateCards([
      card({ id: 'a', title: '', cta: 'x'.repeat(23), art: 'rocket' }),
      card({ id: 'a' }),
    ]);
    expect(errors).toEqual(
      expect.arrayContaining([
        'Card 1: add a title.',
        'Card 1: button text is longer than 22 characters.',
        'Card 1: unknown illustration.',
        'Card 2: id "a" is used twice.',
      ]),
    );
  });

  it('rejects unreadable custom colours and accepts readable ones', () => {
    const bad = validateCards([
      card({
        theme: 'custom',
        colors: {
          bg: '#FFFFFF',
          fg: '#EEEEEE',
          ctaBg: '#000000',
          ctaFg: '#FFFFFF',
        },
      }),
    ]);
    expect(bad.errors).toContain(
      'Card 1: title text is hard to read on this background.',
    );
    const ok = validateCards([
      card({
        theme: 'custom',
        colors: {
          bg: '#0b3d2c',
          fg: '#ffffff',
          ctaBg: '#b8f36b',
          ctaFg: '#0b3d2c',
        },
      }),
    ]);
    expect(ok.errors).toEqual([]);
    expect(ok.cards[0].colors?.bg).toBe('#0B3D2C');
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('only allows https links to listed hosts', () => {
    const hosts = ['regentmoney.com'];
    expect(
      validateCards(
        [card({ action: 'url', url: 'https://www.regentmoney.com/diwali' })],
        hosts,
      ).errors,
    ).toEqual([]);
    expect(
      validateCards(
        [card({ action: 'url', url: 'http://regentmoney.com' })],
        hosts,
      ).errors,
    ).toHaveLength(1);
    expect(
      validateCards(
        [card({ action: 'url', url: 'https://regentmoney.com.evil.io' })],
        hosts,
      ).errors,
    ).toHaveLength(1);
  });

  it('drops paused and ended cards for phones, keeps future ones', () => {
    const list = validateCards([
      card({ id: 'on' }),
      card({ id: 'off', enabled: false }),
      card({ id: 'ended', endsAt: '2026-01-01' }),
      card({ id: 'later', startsAt: '2027-01-01' }),
    ]).cards;
    expect(cardsForPhones(list, '2026-11-12').map((c) => c.id)).toEqual([
      'on',
      'later',
    ]);
  });
});

/** Minimal stand-in for TypeORM's DataSource, backed by arrays. */
function fakeDb() {
  const state = {
    releases: [] as any[],
    draft: null as any,
    audit: [] as any[],
    queries: 0,
  };
  const run = async (sql: string, params: any[] = []) => {
    state.queries++;
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('CREATE TABLE')) return [];
    if (s.includes('pg_advisory_xact_lock')) return [];
    if (
      s.startsWith(
        'SELECT version, cards FROM core.home_card_releases ORDER BY',
      )
    ) {
      const r = [...state.releases].sort((a, b) => b.version - a.version)[0];
      return r ? [r] : [];
    }
    if (s.includes('COALESCE(MAX(version), 0)'))
      return [{ v: Math.max(0, ...state.releases.map((r) => r.version)) }];
    if (s.startsWith('INSERT INTO core.home_card_releases')) {
      if (state.releases.some((r) => r.version === params[0]))
        throw new Error('duplicate key');
      state.releases.push({
        version: params[0],
        cards: JSON.parse(params[1]),
        note: params[2],
      });
      return [];
    }
    if (s.startsWith('INSERT INTO core.home_card_draft')) {
      const guarded = s.includes('WHERE core.home_card_draft.rev = $3');
      if (!state.draft) state.draft = { cards: JSON.parse(params[0]), rev: 1 };
      else if (guarded && state.draft.rev !== params[2]) return [];
      else
        state.draft = {
          cards: JSON.parse(params[0]),
          rev: state.draft.rev + 1,
        };
      return [{ rev: state.draft.rev }];
    }
    if (s.startsWith('DELETE FROM core.home_card_releases')) {
      state.releases = state.releases.filter((r) => r.version > params[0]);
      return [];
    }
    if (s.startsWith('INSERT INTO core.admin_audit_logs')) {
      state.audit.push(params);
      return [];
    }
    if (
      s.startsWith('SELECT cards FROM core.home_card_releases WHERE version')
    ) {
      return state.releases.filter((r) => r.version === params[0]);
    }
    throw new Error(`unexpected query: ${s}`);
  };
  const ds: any = {
    query: run,
    transaction: async (fn: any) => fn({ query: run }),
  };
  return { ds, state };
}

describe('HomeCardsService', () => {
  it('starts at version 0 with nothing published and serves nothing', async () => {
    const { ds } = fakeDb();
    const svc = new HomeCardsService(ds);
    await svc.onModuleInit();
    expect(svc.version).toBe(0);
    expect(svc.liveRelease).toBeNull();
  });

  it('publishes v1, then v2, and serves pre-built bytes without touching the database', async () => {
    const { ds, state } = fakeDb();
    const svc = new HomeCardsService(ds);
    await svc.onModuleInit();

    await svc.publish('admin-1', DEFAULT_CARDS, 'first', 0);
    const paused = DEFAULT_CARDS.map((c) =>
      c.id === 'cash' ? { ...c, enabled: false } : c,
    );
    const r = await svc.publish('admin-1', paused, 'pause cash', 1);
    expect(r.version).toBe(2);
    expect(svc.version).toBe(2);
    expect(state.audit).toHaveLength(2);

    const before = state.queries;
    const live = svc.liveRelease!;
    const payload = JSON.parse(gunzipSync(live.gz).toString('utf8'));
    expect(payload.version).toBe(2);
    expect(payload.cards.map((c: any) => c.id)).not.toContain('cash');
    expect(live.etag).toBe('"hc-2"');
    expect(state.queries).toBe(before);
  });

  it('refuses to publish over a version the admin has not seen', async () => {
    const { ds } = fakeDb();
    const svc = new HomeCardsService(ds);
    await svc.onModuleInit();
    await svc.publish('a', DEFAULT_CARDS, undefined, 0);
    await expect(
      svc.publish('b', DEFAULT_CARDS, undefined, 0),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(svc.version).toBe(1);
  });

  it('rejects invalid cards before writing anything', async () => {
    const { ds, state } = fakeDb();
    const svc = new HomeCardsService(ds);
    await svc.onModuleInit();
    await expect(
      svc.publish('a', [card({ title: '' })], undefined, 0),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.releases).toHaveLength(0);
  });

  it('saves drafts with a revision check', async () => {
    const { ds } = fakeDb();
    const svc = new HomeCardsService(ds);
    await svc.onModuleInit();
    expect((await svc.saveDraft('a', DEFAULT_CARDS, 0)).rev).toBe(1);
    expect((await svc.saveDraft('a', DEFAULT_CARDS, 1)).rev).toBe(2);
    await expect(svc.saveDraft('b', DEFAULT_CARDS, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rolls back by publishing the old cards as a new version', async () => {
    const { ds } = fakeDb();
    const svc = new HomeCardsService(ds);
    await svc.onModuleInit();
    await svc.publish('a', DEFAULT_CARDS, undefined, 0);
    await svc.publish('a', DEFAULT_CARDS.slice(0, 2), undefined, 1);
    const r = await svc.rollback('a', 1, 2);
    expect(r.version).toBe(3);
    expect(svc.liveRelease!.cards).toHaveLength(DEFAULT_CARDS.length);
  });

  it('loads the newest release on boot with one query, shared by concurrent callers', async () => {
    const { ds, state } = fakeDb();
    state.releases.push(
      { version: 4, cards: DEFAULT_CARDS },
      { version: 7, cards: DEFAULT_CARDS.slice(0, 1) },
    );
    const svc = new HomeCardsService(ds);
    const before = state.queries;
    await Promise.all([svc.reload(), svc.reload(), svc.reload()]);
    expect(state.queries - before).toBe(1);
    expect(svc.version).toBe(7);
  });
});
