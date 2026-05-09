module.exports = function (api) {
  api.cache(true);
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // expo-router/babel is deprecated in recent Expo SDKs; babel-preset-expo handles it.
      // Tamagui extraction is kept only in dev because production extraction was unstable here.
      ...(!isProduction ? [
        [
          '@tamagui/babel-plugin',
          {
            components: ['tamagui'],
            config: './tamagui.config.ts',
            logTimings: true,
            disableExtraction: true
          }
        ]
      ] : []),
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src'
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
        }
      ],
      'react-native-reanimated/plugin' // Must stay last.
    ]
  };
};
