const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withExcludeSupport(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents += `
configurations.all {
    exclude group: 'com.android.support'
}
`;
    }
    return config;
  });
};
