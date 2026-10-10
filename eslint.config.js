// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['KeyboardAvoidingView'],
              message:
                "Use <KeyboardScreen> or KeyboardAvoidingView from 'react-native-keyboard-controller'.",
            },
          ],
        },
      ],
    },
  },
]);
