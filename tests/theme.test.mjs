import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  THEME_INIT_SCRIPT,
  getRootThemeAttribute,
  getSavedTheme,
  initializeTheme,
  normalizeTheme,
  parseThemeCookie,
} from '../lib/theme.js';

function runInitScript({ cookie = '', presetDatasetTheme } = {}) {
  let writes = 0;
  const store = {};
  if (presetDatasetTheme !== undefined) {
    store.theme = presetDatasetTheme;
  }

  const dataset = new Proxy(store, {
    set(target, prop, value) {
      writes += 1;
      target[prop] = String(value);
      return true;
    },
    deleteProperty(target, prop) {
      delete target[prop];
      return true;
    },
  });

  const context = {
    document: {
      cookie,
      documentElement: { dataset },
    },
  };

  vm.runInNewContext(THEME_INIT_SCRIPT, context);
  return { dataset: store, writes };
}

test('normalizeTheme and getRootThemeAttribute map themes to root html attributes', () => {
  assert.equal(normalizeTheme('telegram'), 'telegram');
  assert.equal(normalizeTheme('brutalist'), 'brutalist');
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme(undefined), 'light');
  assert.equal(normalizeTheme('unknown'), 'light');

  // Scoped CSS themes set html[data-theme]; light and dark omit the attribute.
  assert.equal(getRootThemeAttribute('telegram'), 'telegram');
  assert.equal(getRootThemeAttribute('brutalist'), 'brutalist');
  assert.equal(getRootThemeAttribute('dark'), undefined);
  assert.equal(getRootThemeAttribute('light'), undefined);
  assert.equal(getRootThemeAttribute(undefined), undefined);
});

test('parseThemeCookie reads the saved theme from Cookie headers and document.cookie', () => {
  assert.equal(parseThemeCookie('theme=telegram'), 'telegram');
  assert.equal(parseThemeCookie('foo=1; theme=telegram; bar=2'), 'telegram');
  assert.equal(parseThemeCookie('other_theme=telegram; theme=brutalist'), 'brutalist');
  assert.equal(parseThemeCookie('other_theme=telegram'), 'light');
  assert.equal(parseThemeCookie('theme=dark'), 'dark');
  assert.equal(parseThemeCookie('theme=invalid'), 'light');
  assert.equal(parseThemeCookie(''), 'light');
});

test('THEME_INIT_SCRIPT applies telegram and brutalist before first paint without redundant writes', () => {
  // Cached/static HTML fallback: sets data-theme="telegram" before body paint.
  const fromEmpty = runInitScript({ cookie: 'a=1; theme=telegram' });
  assert.equal(fromEmpty.dataset.theme, 'telegram');
  assert.equal(fromEmpty.writes, 1);

  // SSR already rendered <html data-theme="telegram">: no redundant DOM mutation.
  const alreadySet = runInitScript({
    cookie: 'theme=telegram',
    presetDatasetTheme: 'telegram',
  });
  assert.equal(alreadySet.dataset.theme, 'telegram');
  assert.equal(alreadySet.writes, 0);

  // Brutalist is applied before paint as well.
  const brutalist = runInitScript({ cookie: 'theme=brutalist' });
  assert.equal(brutalist.dataset.theme, 'brutalist');

  // Light, dark, or missing cookies clear any stale data-theme attribute.
  for (const cookie of ['theme=light', 'theme=dark', 'theme=bogus', '']) {
    const cleared = runInitScript({ cookie, presetDatasetTheme: 'telegram' });
    assert.equal('theme' in cleared.dataset, false);
  }
});

test('initializeTheme syncs documentElement.dataset.theme from document.cookie', () => {
  const previousDocument = globalThis.document;
  try {
    globalThis.document = {
      cookie: 'theme=telegram',
      documentElement: { dataset: {} },
    };
    assert.equal(getSavedTheme(), 'telegram');
    assert.equal(initializeTheme(), 'telegram');
    assert.equal(globalThis.document.documentElement.dataset.theme, 'telegram');

    globalThis.document.cookie = 'theme=light';
    assert.equal(initializeTheme(), 'light');
    assert.equal('theme' in globalThis.document.documentElement.dataset, false);
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});
