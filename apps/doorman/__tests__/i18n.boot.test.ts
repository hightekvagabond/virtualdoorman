/**
 * Boot-time locale selection.
 *
 * `src/i18n/index.ts` initialises i18next at import time, so this has to be a
 * separate suite with a fresh module registry per case — that is the only way
 * to observe which language the app actually starts in. Without it, deleting
 * `lng: detectLanguage()` from the init call breaks Spanish devices while every
 * other suite stays green.
 */
import en from '../src/i18n/locales/en.json';
import es from '../src/i18n/locales/es.json';

type I18nModule = typeof import('../src/i18n');

/** Boots a fresh i18n instance with `findBestLanguageTag` stubbed. */
function bootWithDeviceLanguage(languageTag: string | undefined): I18nModule {
  jest.resetModules();
  jest.doMock('react-native-localize', () => ({
    ...jest.requireActual('react-native-localize/mock/jest'),
    findBestLanguageTag: jest.fn(() =>
      languageTag === undefined ? undefined : { languageTag, isRTL: false },
    ),
  }));

  // `require`, not `import()`: the module has to be re-evaluated against the
  // mock above, and Jest's registry only participates in CommonJS requires.
  return require('../src/i18n') as I18nModule;
}

afterEach(() => {
  jest.dontMock('react-native-localize');
  jest.resetModules();
});

describe('i18n bootstrap', () => {
  it('starts in Spanish on a Spanish device', () => {
    const { default: i18n } = bootWithDeviceLanguage('es');

    expect(i18n.language).toBe('es');
    expect(i18n.t('welcome.heading')).toBe(es.welcome.heading);
  });

  it('starts in English on an English device', () => {
    const { default: i18n } = bootWithDeviceLanguage('en');

    expect(i18n.language).toBe('en');
    expect(i18n.t('welcome.heading')).toBe(en.welcome.heading);
  });

  it('starts in English when the device locale matches nothing we ship', () => {
    const { default: i18n } = bootWithDeviceLanguage(undefined);

    expect(i18n.language).toBe('en');
    expect(i18n.t('welcome.heading')).toBe(en.welcome.heading);
  });
});
