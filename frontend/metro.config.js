const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro can resolve Zustand to ESM on web, which uses import.meta.
// Expo web bundle is served as a classic script, so force CJS entries.
config.resolver.alias = {
  ...config.resolver.alias,
  '@tamagui/core': '@tamagui/core',
  '@tamagui/config': '@tamagui/config',
  zustand: require.resolve('zustand'),
  'zustand/middleware': require.resolve('zustand/middleware'),
};

module.exports = config;
