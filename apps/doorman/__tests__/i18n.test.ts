/**
 * i18n guards: locale parity (so a missing Spanish string fails CI on day one)
 * and language selection/fallback behaviour.
 */
import { findBestLanguageTag } from 'react-native-localize';

import i18n, {
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGES,
  detectLanguage,
} from '../src/i18n';
import en from '../src/i18n/locales/en.json';
import es from '../src/i18n/locales/es.json';

// jest.setup.js swaps in react-native-localize's own jest mock, so every
// export is already a jest.fn these tests can steer.
const findBestLanguageTagMock = findBestLanguageTag as jest.MockedFunction<
  typeof findBestLanguageTag
>;

/** Flattens `{a: {b: 'x'}}` to `['a.b']`. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

describe('locale catalogues', () => {
  it('ship the same keys in every language', () => {
    const enKeys = keyPaths(en).sort();
    const esKeys = keyPaths(es).sort();

    expect(esKeys).toEqual(enKeys);
  });

  it('leave no string untranslated between en and es', () => {
    expect(es.app.title).not.toBe(en.app.title);
    expect(es.welcome.heading).not.toBe(en.welcome.heading);
  });
});

describe('detectLanguage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(SUPPORTED_LANGUAGES)('keeps the supported locale %s', tag => {
    findBestLanguageTagMock.mockReturnValueOnce({
      languageTag: tag,
      isRTL: false,
    });

    expect(detectLanguage()).toBe(tag);
  });

  it('falls back to English when the device locale is unsupported', () => {
    findBestLanguageTagMock.mockReturnValueOnce(undefined);

    expect(detectLanguage()).toBe(FALLBACK_LANGUAGE);
  });
});

describe('translation lookup', () => {
  afterEach(async () => {
    await i18n.changeLanguage(FALLBACK_LANGUAGE);
  });

  it('returns Spanish strings after switching language', async () => {
    await i18n.changeLanguage('es');

    expect(i18n.t('welcome.heading')).toBe(es.welcome.heading);
  });

  it('falls back to English for an unknown locale', async () => {
    await i18n.changeLanguage('fr');

    expect(i18n.t('welcome.heading')).toBe(en.welcome.heading);
  });

  it('interpolates values', async () => {
    await i18n.changeLanguage('en');

    expect(i18n.t('welcome.environment', { envName: 'development' })).toContain(
      'development',
    );
  });
});
