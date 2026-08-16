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

/** Flattens `{a: {b: 'x'}}` to `[['a.b', 'x']]`. */
function leaves(value: unknown, prefix = ''): [string, string][] {
  if (typeof value !== 'object' || value === null) {
    return [[prefix, String(value)]];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/**
 * Key paths whose Spanish text is legitimately identical to the English.
 * Empty today; add a key here (with a reason) rather than weakening the check.
 */
const IDENTICAL_ACROSS_LOCALES: readonly string[] = [];

describe('locale catalogues', () => {
  it('ship the same keys in every language', () => {
    const enKeys = leaves(en)
      .map(([key]) => key)
      .sort();
    const esKeys = leaves(es)
      .map(([key]) => key)
      .sort();

    expect(esKeys).toEqual(enKeys);
  });

  it('leave no string untranslated between en and es', () => {
    const esByKey = new Map(leaves(es));
    const untranslated = leaves(en)
      .filter(([key]) => !IDENTICAL_ACROSS_LOCALES.includes(key))
      .filter(([key, enText]) => esByKey.get(key) === enText)
      .map(([key]) => key);

    expect(untranslated).toEqual([]);
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

  it('offers exactly the locales we ship to the matcher', () => {
    detectLanguage();

    // Without this the stubbed return value above would also satisfy an
    // implementation that asked for the wrong set of languages.
    expect(findBestLanguageTagMock).toHaveBeenCalledWith(['en', 'es']);
  });

  it('falls back to English when the device locale is unsupported', () => {
    findBestLanguageTagMock.mockReturnValueOnce(undefined);

    expect(detectLanguage()).toBe(FALLBACK_LANGUAGE);
  });

  it('falls back to English for a tag outside the shipped set', () => {
    // react-native-localize only ever returns a member of the array it was
    // given, but the guard has to hold if that contract is ever broken.
    findBestLanguageTagMock.mockReturnValueOnce({
      languageTag: 'fr' as 'en',
      isRTL: false,
    });

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
