import { createHmac } from 'crypto';
import { signedUserIdOf, clientIpOf } from './throttler-behind-proxy.guard';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (payload: object, secret: string, alg = 'HS256') => {
  const body = `${b64({ alg, typ: 'JWT' })}.${b64(payload)}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
};
const req = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {}, ip: '10.0.0.9' });

describe('rate-limit tracker', () => {
  const before = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'unit-test-secret';
  });
  afterAll(() => {
    if (before === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = before;
  });

  it('uses the user id from a genuinely signed token (even an expired one)', () => {
    expect(signedUserIdOf(req(sign({ sub: 'user-1', exp: 1 }, 'unit-test-secret')))).toBe('user-1');
  });

  it('ignores forged, unsigned or malformed tokens, so invented user ids cannot dodge the limit', () => {
    expect(signedUserIdOf(req(sign({ sub: 'user-1' }, 'wrong-secret')))).toBeNull();
    expect(signedUserIdOf(req(sign({ sub: 'user-1' }, 'unit-test-secret', 'none')))).toBeNull();
    expect(signedUserIdOf(req(`${b64({ alg: 'HS256' })}.${b64({ sub: 'user-1' })}.`))).toBeNull();
    expect(signedUserIdOf(req('not-a-token'))).toBeNull();
    expect(signedUserIdOf(req())).toBeNull();
  });

  it('falls back to the network address', () => {
    expect(clientIpOf(req())).toBe('10.0.0.9');
  });
});
