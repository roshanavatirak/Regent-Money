import type { PDFExtract } from 'pdf.js-extract';

type PdfExtractClass = new () => PDFExtract;

/**
 * Picks the PDFExtract class out of whatever the library hands back.
 * pdf.js-extract 1.x gives `require` a promise of the class itself; 0.x and `import` give
 * an object with a `PDFExtract` field. Accepting every shape keeps a library update from
 * breaking statement uploads again.
 */
export const resolvePdfExtractClass = (loaded: any): PdfExtractClass => {
  const found = loaded?.PDFExtract ?? loaded?.default?.PDFExtract ?? loaded?.default ?? loaded;
  if (typeof found !== 'function') {
    throw new Error('pdf.js-extract did not provide the PDFExtract class.');
  }
  return found;
};

let cached: Promise<PdfExtractClass> | undefined;

/** Loads the PDF reader once and reuses it. A failed load is retried on the next call. */
export const loadPdfExtract = (): Promise<PdfExtractClass> => {
  if (!cached) {
    cached = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loaded = await require('pdf.js-extract');
      return resolvePdfExtractClass(loaded);
    })();
    cached.catch(() => {
      cached = undefined;
    });
  }
  return cached;
};
