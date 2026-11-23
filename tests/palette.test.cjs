const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const css = readFileSync(require.resolve('../site/style.css'), 'utf8');

function tokens(selector, from = 0) {
  const start = css.indexOf(`${selector} {`, from);
  assert.notEqual(start, -1, `site/style.css is missing ${selector}`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]),
  );
}

const light = tokens(':root');
const DARK = '@media screen and (prefers-color-scheme: dark) {';
const dark = tokens(':root', css.indexOf(DARK));

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text token -> the surfaces it is drawn on in site/style.css.
const TEXT_ON = {
  '--ink': ['--paper', '--field', '--hover', '--notice', '--bottom', '--table'],
  '--muted': ['--paper', '--field', '--hover', '--table', '--bottom'],
  '--orange-text': ['--paper', '--hover'],
  '--green': ['--paper'],
  '--warning-text': ['--paper'],
  '--view-text': ['--paper'],
  '--error-text': ['--paper'],
  '--inverse-text': ['--ink', '--green'],
  '--tag-text': ['--lime'],
  '--uncertain-text': ['--uncertain'],
  '--bar-text': ['--bar'],
};

// Border token -> the surfaces on either side of it. A border that marks a
// form control or button needs 3:1 (WCAG 1.4.11) against the control's fill
// and the page around it.
const BOUNDARY_ON = {
  '--field-line': ['--field', '--paper'],
};

test('every light color token has a dark value', () => {
  const colors = Object.keys(light).filter(
    (name) => name !== '--mono' && name !== '--sans',
  );
  assert.deepEqual(Object.keys(dark).sort(), colors.sort());
});

test('dark tokens apply only on screens so printed pages keep dark text', () => {
  assert.match(
    css,
    /@media screen and \(prefers-color-scheme: dark\) \{\s*:root \{/,
  );
});

test('text tokens meet WCAG AA on the surfaces they are used on in both themes', () => {
  for (const [name, palette] of [
    ['light', light],
    ['dark', dark],
  ]) {
    for (const [text, surfaces] of Object.entries(TEXT_ON)) {
      for (const surface of surfaces) {
        const ratio = contrast(palette[text], palette[surface]);
        assert.ok(
          ratio >= 4.5,
          `${name}: ${text} on ${surface} is ${ratio.toFixed(2)}:1, below 4.5:1`,
        );
      }
    }
  }
});

test('control borders meet WCAG non-text contrast in both themes', () => {
  for (const [name, palette] of [
    ['light', light],
    ['dark', dark],
  ]) {
    for (const [border, surfaces] of Object.entries(BOUNDARY_ON)) {
      for (const surface of surfaces) {
        const ratio = contrast(palette[border], palette[surface]);
        assert.ok(
          ratio >= 3,
          `${name}: ${border} on ${surface} is ${ratio.toFixed(2)}:1, below 3:1`,
        );
      }
    }
  }
});
