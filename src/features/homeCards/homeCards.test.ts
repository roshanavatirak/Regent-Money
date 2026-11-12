import assert from 'node:assert';
import { test } from 'node:test';
import { readCards, cardProblems, type HomeCard } from './schema.ts';
import { DEFAULT_CARDS, TEMPLATES } from './defaults.ts';
import { selectCards, fillTitle, type CardContext } from './selectCards.ts';
import { assignThemes } from './themes.ts';
import { diffCards, freshId } from './diff.ts';
import { reportHomeCardsHeader, onHomeCardsVersion, resetHomeCardsSignal } from './homeCardsSignal.ts';

const ctx = (over: Partial<CardContext> = {}): CardContext => ({
  platform: 'android',
  hasBanks: false,
  smsTrackingOn: false,
  hasCash: false,
  hasBudget: false,
  income: 50000,
  spent: 62000,
  firstName: 'Aarav Mehta',
  today: '2026-11-12',
  monthName: 'November',
  ...over,
});

test('the built-in cards reproduce what Home showed before', () => {
  const ids = selectCards(DEFAULT_CARDS, ctx()).map((v) => v.card.id);
  assert.deepStrictEqual(ids, ['bank', 'overspend', 'cash', 'sms', 'regent']);
  const saved = selectCards(DEFAULT_CARDS, ctx({ hasBanks: true, hasCash: true, smsTrackingOn: true, spent: 40000 }));
  assert.deepStrictEqual(saved.map((v) => v.card.id), ['kept', 'regent']);
  assert.strictEqual(saved[0].title, 'You kept 20% of what you earned this month');
});

test('iOS never sees the Android-only SMS card', () => {
  assert.ok(!selectCards(DEFAULT_CARDS, ctx({ platform: 'ios' })).some((v) => v.card.id === 'sms'));
});

test('fills title tokens from local numbers', () => {
  assert.strictEqual(fillTitle('Hi {{first_name}}, ₹{{spent_per_rupee}} in {{month}}', ctx()), 'Hi Aarav, ₹1.24 in November');
});

test('respects schedule, pause and the 6-card cap', () => {
  const base = TEMPLATES.find((t) => t.key === 'goal')!.card;
  const many: HomeCard[] = Array.from({ length: 9 }, (_, i) => ({ ...base, id: `g${i}` }));
  many[0] = { ...many[0], enabled: false };
  many[1] = { ...many[1], startsAt: '2026-12-01' };
  many[2] = { ...many[2], endsAt: '2026-11-11' };
  const ids = selectCards(many, ctx()).map((v) => v.card.id);
  assert.deepStrictEqual(ids, ['g3', 'g4', 'g5', 'g6', 'g7', 'g8']);
});

test('neighbouring cards never share a colour, including the wrap-around', () => {
  const shown = assignThemes([
    { id: 'a', theme: 'lime' },
    { id: 'b', theme: 'lime' },
    { id: 'c', theme: 'lilac' },
    { id: 'd', theme: 'lime' },
  ]);
  shown.forEach((t, i) => assert.notStrictEqual(t, shown[(i + 1) % shown.length]));
});

test('drops cards this build cannot draw instead of crashing', () => {
  const cards = readCards([
    DEFAULT_CARDS[0],
    { ...DEFAULT_CARDS[1], art: 'rocket' },
    { ...DEFAULT_CARDS[2], theme: 'custom', colors: { bg: 'red' } },
    { ...DEFAULT_CARDS[3], action: 'url', url: 'http://insecure.example' },
    'nonsense',
  ]);
  assert.deepStrictEqual(cards.map((c) => c.id), ['bank']);
});

test('flags unreadable custom colours and bad links', () => {
  const card: HomeCard = { ...DEFAULT_CARDS[0], theme: 'custom', colors: { bg: '#FFFFFF', fg: '#F0F0F0', ctaBg: '#000000', ctaFg: '#FFFFFF' } };
  assert.ok(cardProblems(card).colors);
  assert.ok(cardProblems({ ...DEFAULT_CARDS[0], action: 'url', url: 'regentmoney.com' }).url);
  assert.deepStrictEqual(cardProblems(DEFAULT_CARDS[0]), {});
});

test('lists every change for the publish confirmation', () => {
  const draft = [
    { ...DEFAULT_CARDS[1], title: 'Over budget again?' },
    { ...DEFAULT_CARDS[0], enabled: false },
    ...DEFAULT_CARDS.slice(2, 5),
    { ...TEMPLATES[7].card, id: 'bills' },
  ];
  const kinds = diffCards(DEFAULT_CARDS, draft).map((c) => `${c.kind}:${c.id ?? ''}`);
  assert.deepStrictEqual(kinds, ['Edited:overspend', 'Paused:bank', 'Added:bills', 'Removed:regent', 'Reordered:']);
  assert.deepStrictEqual(diffCards(DEFAULT_CARDS, DEFAULT_CARDS), []);
});

test('fresh ids never clash', () => {
  assert.strictEqual(freshId('goal', ['bank']), 'goal');
  assert.strictEqual(freshId('goal', ['goal', 'goal-2']), 'goal-3');
});

test('the version header reaches the store on every response', () => {
  resetHomeCardsSignal();
  const seen: number[] = [];
  onHomeCardsVersion((v) => seen.push(v));
  const res = (v: string | null) => ({ headers: { get: () => v } });
  reportHomeCardsHeader(res(null));
  reportHomeCardsHeader(res('abc'));
  reportHomeCardsHeader(res('3'));
  reportHomeCardsHeader(res('3'));
  assert.deepStrictEqual(seen, [3, 3]);
});
