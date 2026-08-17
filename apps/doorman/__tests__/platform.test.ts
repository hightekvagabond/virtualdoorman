/**
 * The suite must run against the Android module graph.
 *
 * `@react-native/jest-preset` defaults to iOS, so without the `haste` override
 * in `jest.config.js` every test here resolves `*.ios.js` module variants and
 * sees `Platform.OS === 'ios'` — on an app that has no `ios/` directory at all.
 * That override is load-bearing and silent: deleting it changes what the whole
 * suite exercises without failing anything. This is the assertion that notices.
 */
import { Platform } from 'react-native';

it('resolves react-native as the Android app it is', () => {
  expect(Platform.OS).toBe('android');
});
