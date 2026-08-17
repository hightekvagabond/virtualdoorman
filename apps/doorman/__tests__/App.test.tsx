/**
 * Smoke test: the scaffold screen renders and its copy comes from i18n.
 */
import ReactTestRenderer from 'react-test-renderer';

import App from '../src/App';
import i18n from '../src/i18n';
import en from '../src/i18n/locales/en.json';
import es from '../src/i18n/locales/es.json';

let tree: ReactTestRenderer.ReactTestRenderer | undefined;

/** Serialises whatever is currently mounted. */
function renderedText(): string {
  return JSON.stringify(tree?.toJSON());
}

async function renderApp(): Promise<string> {
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });

  return renderedText();
}

describe('App', () => {
  afterEach(async () => {
    await ReactTestRenderer.act(async () => {
      tree?.unmount();
      await i18n.changeLanguage('en');
    });
    tree = undefined;
  });

  it('renders translated copy, not raw i18n keys', async () => {
    const text = await renderApp();

    expect(text).toContain(en.app.title);
    expect(text).toContain(en.welcome.heading);
    expect(text).not.toContain('welcome.heading');
  });

  it('renders the environment baked into the build', async () => {
    const text = await renderApp();

    expect(text).toContain('development');
  });

  it('translates every string it renders, including the property placeholder', async () => {
    const text = await renderApp();

    expect(text).toContain(en.property.unpaired);
    expect(text).not.toContain('property.unpaired');
  });

  // Mounted first, then switched: this is what proves react-i18next's
  // `languageChanged` subscription is live. Changing the language *before*
  // mounting would pass even with re-rendering disabled entirely.
  it('re-renders the mounted tree when the language changes', async () => {
    const before = await renderApp();

    expect(before).toContain(en.welcome.heading);

    await ReactTestRenderer.act(async () => {
      await i18n.changeLanguage('es');
    });

    const after = renderedText();

    expect(after).toContain(es.welcome.heading);
    expect(after).toContain(es.property.unpaired);
    expect(after).not.toContain(en.welcome.heading);
  });
});
