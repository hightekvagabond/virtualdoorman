/**
 * The bundle must bootstrap i18n by itself.
 *
 * `App.test.tsx` imports `../src/i18n` for the handle it needs to switch
 * languages, and that import performs the initialisation as a side effect — so
 * it would keep passing even if `App.tsx` stopped importing `./i18n`, while a
 * real device rendered raw keys. This suite therefore imports **only** the
 * entry point, exactly like `index.js` does, and never touches `../src/i18n`.
 */
import type { ReactTestRenderer } from 'react-test-renderer';
import TestRenderer from 'react-test-renderer';

import en from '../src/i18n/locales/en.json';

describe('App, booted the way index.js boots it', () => {
  it('initialises i18n itself rather than relying on the importer', async () => {
    // `require`, not a top-level import: the point is that nothing but the
    // entry point is loaded before `App` runs.
    const App = require('../src/App').default as React.ComponentType;

    let tree: ReactTestRenderer | undefined;
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<App />);
    });

    const text = JSON.stringify(tree?.toJSON());

    expect(text).toContain(en.app.title);
    expect(text).toContain(en.welcome.heading);
    // An uninitialised i18next renders the key itself.
    expect(text).not.toContain('app.title');
    expect(text).not.toContain('welcome.heading');

    await TestRenderer.act(() => {
      tree?.unmount();
    });
  });
});
