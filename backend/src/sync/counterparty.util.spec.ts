import { cleanCounterpartyKey, COUNTERPARTY_ID_PATTERN } from './counterparty.util';

describe('cleanCounterpartyKey', () => {
  it('accepts what the SMS parsers write', () => {
    expect(cleanCounterpartyKey('vpa:rohit.c@okaxis')).toBe('vpa:rohit.c@okaxis');
    expect(cleanCounterpartyKey('vpa:zepto.payu@hdfcbank')).toBe('vpa:zepto.payu@hdfcbank');
    expect(cleanCounterpartyKey(' VPA:Priya.K@YBL ')).toBe('vpa:priya.k@ybl');
    expect(cleanCounterpartyKey('acct:4821')).toBe('acct:4821');
    expect(cleanCounterpartyKey('acct:998')).toBe('acct:998');
  });

  it('drops anything else instead of failing the transaction', () => {
    for (const bad of [undefined, null, 42, '', 'rohit', 'vpa:', 'vpa:rohit', 'acct:12', 'acct:123456', 'name:rohit', 'vpa:a@b c']) {
      expect(cleanCounterpartyKey(bad)).toBeUndefined();
    }
    expect(cleanCounterpartyKey(`vpa:${'a'.repeat(200)}@ybl`)).toBeUndefined();
  });
});

describe('COUNTERPARTY_ID_PATTERN', () => {
  it('matches the ids the app makes and nothing that could break out of a value', () => {
    expect(COUNTERPARTY_ID_PATTERN.test('contact_1731000000000_ab12c')).toBe(true);
    expect(COUNTERPARTY_ID_PATTERN.test("x' OR 1=1")).toBe(false);
    expect(COUNTERPARTY_ID_PATTERN.test('a'.repeat(81))).toBe(false);
  });
});
