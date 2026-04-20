const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Enable JS bundle embedding in debug builds
 * so debug APKs can run offline without Metro dev server.
 */
const withBundleInDebug = (config) => {
  return withAppBuildGradle(config, (config) => {
    let buildGradle = config.modResults.contents;
    if (buildGradle.includes('bundleInDebug')) {
      return config;
    }
    // Add bundleInDebug in the debug buildType (inside android { buildTypes { } })
    buildGradle = buildGradle.replace(
      /(buildTypes\s*\{\s*debug\s*\{)/,
      `$1\n            bundleInDebug = true`
    );
    config.modResults.contents = buildGradle;
    console.log('✅ bundleInDebug enabled');
    return config;
  });
};

module.exports = withBundleInDebug;

