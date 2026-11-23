import assert from 'node:assert';
import { test } from 'node:test';
import { dedupeBanks, bankNameKey, UNIQUE_BANKS, codeForBankName } from './bankList.ts';

test('the real list has one row per bank', () => {
  const keys = UNIQUE_BANKS.map((b) => bankNameKey(b.name));
  assert.strictEqual(new Set(keys).size, keys.length);
  const ippb = UNIQUE_BANKS.filter((b) => /india post payments/i.test(b.name));
  assert.deepStrictEqual(ippb, [{ code: 'IPOS', name: 'India Post Payments Bank' }]);
});

test('slice Small Finance Bank is listed under its new name, old name still matches', () => {
  const slice = UNIQUE_BANKS.filter((b) => b.code === 'NESF');
  assert.deepStrictEqual(slice, [
    { code: 'NESF', name: 'slice Small Finance Bank', formerly: 'North East Small Finance Bank' },
  ]);
  assert.strictEqual(codeForBankName('slice Small Finance Bank'), 'NESF');
  assert.strictEqual(codeForBankName('North East Small Finance Bank'), 'NESF');
});

test('slice resolves to its logo code from the name alone', async () => {
  const { resolveBankCode, KNOWN_SVG_CODES, bankBrandColor } = await import('./bankBrand.ts');
  assert.ok(KNOWN_SVG_CODES.has('NESF'));
  assert.strictEqual(resolveBankCode('slice Small Finance Bank'), 'NESF');
  assert.strictEqual(resolveBankCode('North East Small Finance Bank'), 'NESF');
  assert.strictEqual(resolveBankCode('Sliceable Bank'), '');
  assert.strictEqual(bankBrandColor('slice Small Finance Bank'), '#8B0CBE');
});

test('Paytm Payments Bank is listed but marked restricted by RBI', () => {
  const paytm = UNIQUE_BANKS.filter((b) => b.code === 'PYTM');
  assert.strictEqual(paytm.length, 1);
  assert.match(paytm[0].restricted || '', /RBI/);
  assert.strictEqual(codeForBankName('Paytm Payments Bank'), 'PYTM');
  assert.strictEqual(UNIQUE_BANKS.filter((b) => b.restricted).length, 1);
});

test('Paytm Payments Bank gets its logo code', async () => {
  const { resolveBankCode, KNOWN_SVG_CODES } = await import('./bankBrand.ts');
  assert.ok(KNOWN_SVG_CODES.has('PYTM'));
  assert.strictEqual(resolveBankCode('Paytm Payments Bank'), 'PYTM');
  assert.strictEqual(resolveBankCode('Paytm Payments Bank', undefined, 'PYTM'), 'PYTM');
});

test('Airtel Payments Bank gets its logo code and colour', async () => {
  const { resolveBankCode, KNOWN_SVG_CODES, bankBrandColor } = await import('./bankBrand.ts');
  assert.ok(KNOWN_SVG_CODES.has('AIRP'));
  assert.strictEqual(resolveBankCode('Airtel Payments Bank'), 'AIRP');
  assert.strictEqual(bankBrandColor('Airtel Payments Bank'), '#D32026');
});

test('every old code and spelling still finds the bank', () => {
  assert.strictEqual(codeForBankName('India Post Payments Bank'), 'IPOS');
  assert.strictEqual(codeForBankName('india post payments bank '), 'IPOS');
  assert.strictEqual(codeForBankName('THE BURDWAN CENTRAL CO OPERATIVE BANK LTD'), 'BUCB');
  assert.strictEqual(codeForBankName('Burdwan Central Co-operative Bank'), 'BUCB');
  assert.strictEqual(codeForBankName('HDFC Bank'), 'HDFC');
  assert.strictEqual(codeForBankName(''), '');
  assert.strictEqual(codeForBankName('Not A Real Bank'), '');
});

test('picks the logo code, then a non-X code, and the readable spelling', () => {
  const { banks } = dedupeBanks({
    IPPB: 'India Post Payments Bank',
    IPOS: 'India Post Payments Bank',
    AJUX: 'Ajara Urban Co-operative Bank',
    AJAR: 'Ajara Urban Co-operative Bank',
    MSBL: 'MAHESH SAHAKARI BANK LTD PUNE',
    MHSX: 'Mahesh Sahakari Bank Pune',
    FINF: 'Fincare Small Finance Bank ',
  });
  assert.deepStrictEqual(banks, [
    { code: 'AJAR', name: 'Ajara Urban Co-operative Bank' },
    { code: 'FINF', name: 'Fincare Small Finance Bank' },
    { code: 'IPOS', name: 'India Post Payments Bank' },
    { code: 'MSBL', name: 'Mahesh Sahakari Bank Pune' },
  ]);
});
