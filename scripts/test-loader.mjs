// A lightweight ESM loader hook to allow extensionless .ts resolution and react-native stubbing under Node 22 test runner
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'react-native') {
    return {
      format: 'module',
      shortCircuit: true,
      url: 'data:text/javascript,export const Platform = { OS: "android" }; export const NativeModules = {}; export default { Platform, NativeModules };',
    };
  }

  if (specifier.endsWith('.json')) {
    const res = await nextResolve(specifier, context);
    return {
      ...res,
      importAttributes: { ...context.importAttributes, type: 'json' },
    };
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.json')) {
      try {
        return await nextResolve(specifier + '.ts', context);
      } catch {
        // fallback
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) {
    return nextLoad(url, { ...context, format: 'json' });
  }
  return nextLoad(url, context);
}
