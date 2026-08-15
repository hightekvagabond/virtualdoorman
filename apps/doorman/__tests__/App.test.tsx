/**
 * Smoke test: the scaffold screen renders and its copy comes from i18n.
 */
import ReactTestRenderer from 'react-test-renderer';

import App from '../src/App';
import i18n from '../src/i18n';
import en from '../src/i18n/locales/en.json';
import es from '../src/i18n/locales/es.json';

let tree: ReactTestRenderer.ReactTestRenderer | undefined;

async function renderApp(): Promise<string> {
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });

  return JSON.stringify(tree?.toJSON());
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

  it('re-renders in Spanish when the language changes', async () => {
    await ReactTestRenderer.act(async () => {
      await i18n.changeLanguage('es');
    });

    const text = await renderApp();

    expect(text).toContain(es.welcome.heading);
    expect(text).not.toContain(en.welcome.heading);
  });
});
