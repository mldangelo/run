const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const script = readFileSync(require.resolve('../site/theme.js'), 'utf8');
function setup(initial, blocked = false) {
  const attributes = {};
  const handlers = {};
  const windowHandlers = {};
  let saved = initial;
  const select = {
    value: '',
    addEventListener(type, callback) {
      handlers[type] = callback;
    },
  };
  const control = { hidden: true };
  const metas = ['light', 'dark'].map((scheme) => {
    const meta = {
      'data-scheme': scheme,
      media: `(prefers-color-scheme: ${scheme})`,
      getAttribute: (name) => meta[name],
      setAttribute: (name, value) => {
        meta[name] = value;
      },
    };
    return meta;
  });
  const storage = {
    getItem() {
      if (blocked) throw Error('blocked');
      return saved;
    },
    setItem(_key, value) {
      if (blocked) throw Error('blocked');
      saved = value;
    },
    removeItem() {
      if (blocked) throw Error('blocked');
      saved = null;
    },
  };
  const document = {
    documentElement: {
      setAttribute(name, value) {
        attributes[name] = value;
      },
      removeAttribute(name) {
        delete attributes[name];
      },
    },
    getElementById(id) {
      return id === 'theme' ? select : control;
    },
    querySelectorAll(selector) {
      assert.equal(selector, 'meta[name="theme-color"][data-scheme]');
      return metas;
    },
    addEventListener(type, callback) {
      handlers[type] = callback;
    },
  };
  const window = {
    localStorage: storage,
    addEventListener(type, callback) {
      windowHandlers[type] = callback;
    },
  };
  vm.runInNewContext(script, { document, window });
  return {
    attributes,
    handlers,
    windowHandlers,
    select,
    control,
    media: () => metas.map((meta) => meta.media),
    saved: () => saved,
  };
}

test('a saved preference applies before the page is ready and is reflected in the selector', () => {
  const page = setup('dark');
  assert.equal(page.attributes['data-theme'], 'dark');
  page.handlers.DOMContentLoaded();
  assert.equal(page.select.value, 'dark');
  assert.equal(page.control.hidden, false);
});

test('theme choices persist, system mode clears the override, and other tabs synchronize', () => {
  const page = setup(null);
  page.handlers.DOMContentLoaded();
  assert.equal(page.select.value, 'system');
  page.select.value = 'light';
  page.handlers.change();
  assert.equal(page.attributes['data-theme'], 'light');
  assert.equal(page.saved(), 'light');
  page.select.value = 'system';
  page.handlers.change();
  assert.equal(page.attributes['data-theme'], undefined);
  assert.equal(page.saved(), null);
  page.windowHandlers.storage({ key: 'sf-run-theme', newValue: 'dark' });
  assert.equal(page.attributes['data-theme'], 'dark');
  assert.equal(page.select.value, 'dark');
  page.windowHandlers.storage({ key: null });
  assert.equal(page.attributes['data-theme'], undefined);
  assert.equal(page.select.value, 'system');
});

test('blocked storage and invalid stored values fall back safely to system mode', () => {
  for (const page of [setup('not-a-theme'), setup(null, true)]) {
    page.handlers.DOMContentLoaded();
    assert.equal(page.select.value, 'system');
    assert.equal(page.attributes['data-theme'], undefined);
  }
  const page = setup(null, true);
  page.handlers.DOMContentLoaded();
  page.select.value = 'dark';
  page.handlers.change();
  assert.equal(page.attributes['data-theme'], 'dark');
});

test('the browser bar color follows the saved theme and returns to the device setting', () => {
  const page = setup('dark');
  assert.deepEqual(page.media(), ['not all', 'all']);
  page.handlers.DOMContentLoaded();
  page.select.value = 'light';
  page.handlers.change();
  assert.deepEqual(page.media(), ['all', 'not all']);
  page.select.value = 'system';
  page.handlers.change();
  assert.deepEqual(page.media(), [
    '(prefers-color-scheme: light)',
    '(prefers-color-scheme: dark)',
  ]);
});
