module.exports = function(api) {
  api.cache(true);
  // Release bundles drop console.log/info/debug so financial details never reach logcat;
  // warn and error stay for crash diagnostics.
  const isProduction = process.env.NODE_ENV === 'production' || process.env.BABEL_ENV === 'production';
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      ...(isProduction ? [['transform-remove-console', { exclude: ['warn', 'error'] }]] : []),
      'react-native-worklets/plugin', // required for react-native-reanimated v4+
    ],
  };
};
