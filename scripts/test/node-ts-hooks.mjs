// Module hooks so `node --test` can load app source written for Metro:
// extensionless relative imports resolve to .ts/.tsx, JSON imports work without
// import attributes, and 'react-native' is a tiny stub (tests never touch native code).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RN_STUB = 'stub:react-native';
const EXTS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, next) {
  if (specifier === 'react-native') return { url: RN_STUB, shortCircuit: true };
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  if (isRelative && context.parentURL?.startsWith('file:')) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    if (!existsSync(base) || !/\.[a-z]+$/i.test(base)) {
      for (const ext of EXTS) {
        if (existsSync(base + ext)) return { url: pathToFileURL(base + ext).href, shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url === RN_STUB) {
    return {
      format: 'module',
      shortCircuit: true,
      source: "export const NativeModules = {}; export const Platform = { OS: 'android' }; export default {};",
    };
  }
  if (url.endsWith('.json')) {
    return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};` };
  }
  return next(url, context);
}
