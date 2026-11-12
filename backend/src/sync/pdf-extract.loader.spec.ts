import { resolvePdfExtractClass } from './pdf-extract.loader';

class FakePdfExtract {}

describe('resolvePdfExtractClass', () => {
  it('accepts the class itself (pdf.js-extract 1.x through require)', () => {
    expect(resolvePdfExtractClass(FakePdfExtract)).toBe(FakePdfExtract);
  });

  it('accepts an object with a PDFExtract field (0.x, or 1.x through import)', () => {
    expect(resolvePdfExtractClass({ PDFExtract: FakePdfExtract })).toBe(FakePdfExtract);
  });

  it('accepts a default export, wrapped or bare', () => {
    expect(resolvePdfExtractClass({ default: { PDFExtract: FakePdfExtract } })).toBe(FakePdfExtract);
    expect(resolvePdfExtractClass({ default: FakePdfExtract })).toBe(FakePdfExtract);
  });

  it('fails with a clear message when the class is missing', () => {
    expect(() => resolvePdfExtractClass({})).toThrow('did not provide the PDFExtract class');
    expect(() => resolvePdfExtractClass(undefined)).toThrow('did not provide the PDFExtract class');
  });
});
