/* sticker-text Node checks. Plain Node, no browser. Copyright (c) 2026 LFC Foundry. MIT License. */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path');
var ST = require('../sticker-text.js');
var css = fs.readFileSync(path.join(__dirname, '..', 'sticker-text.css'), 'utf8');
var pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL ' + name + ': ' + (e && e.message)); } }

function fakeEl(text) {
  var attrs = {}, cls = {}, props = {};
  return {
    textContent: text, _attrs: attrs, _props: props,
    setAttribute: function (k, v) { attrs[k] = v; }, getAttribute: function (k) { return attrs[k]; },
    classList: { add: function (c) { cls[c] = 1; }, contains: function (c) { return !!cls[c]; } },
    style: { setProperty: function (k, v) { props[k] = v; } }
  };
}

t('ringShadow makes 48 zero-blur offsets in the given color', function () {
  var s = ST.ringShadow('#fff7e3'); assert.strictEqual(s.split(',').length, 48); assert.ok(/ 0 #fff7e3/.test(s));
});
t('ringShadow takes radii and steps', function () { assert.strictEqual(ST.ringShadow('red', [0.1], 8).split(',').length, 8); });
t('ringShadow falls back on bad arguments', function () {
  assert.strictEqual(ST.ringShadow(null, 'x', 'y').split(',').length, 48);
  assert.ok(/ 0 #fff7e3/.test(ST.ringShadow(undefined)));
  assert.strictEqual(ST.ringShadow('red', [NaN, -1, 'a'], -3).split(',').length, 48);
  assert.ok(ST.ringShadow('red', [0.1], 100000).split(',').length <= 96);
});
t('apply copies the text, adds the class and writes a 48-shadow ring', function () {
  var el = fakeEl('Bloop'); assert.strictEqual(ST.apply(el), el);
  assert.strictEqual(el.getAttribute('data-t'), 'Bloop'); assert.ok(el.classList.contains('sticker-text'));
  assert.strictEqual(el._props['--st-ring'].split(',').length, 48);
});
t('the ring reads its color from a CSS variable, so --st-outline can recolor it', function () {
  var el = fakeEl('Bloop'); ST.apply(el, { outline: '#123456' });
  assert.ok(/ 0 var\(--st-ring-color\)/.test(el._props['--st-ring']));
  assert.ok(el._props['--st-ring'].indexOf('#123456') < 0, 'the color must not be baked into the ring');
  assert.strictEqual(el._props['--st-outline-default'], '#123456');
  assert.ok(/--st-ring-color:\s*var\(--st-outline,\s*var\(--st-outline-default/.test(css));
  assert.ok(/::before\s*\{[^}]*color:\s*var\(--st-ring-color\)/.test(css));
});
t('apply without an outline leaves the default to the CSS', function () {
  var el = fakeEl('A'); ST.apply(el); assert.strictEqual(el._props['--st-outline-default'], undefined);
});
t('update refreshes data-t after the text changed', function () {
  var el = fakeEl('Score 1'); ST.apply(el); el.textContent = 'Score 2'; assert.strictEqual(el.getAttribute('data-t'), 'Score 1');
  ST.update(el); assert.strictEqual(el.getAttribute('data-t'), 'Score 2');
});
t('update on a never-applied element applies it; with options it redoes the ring', function () {
  var el = fakeEl('X'); ST.update(el); assert.ok(el.classList.contains('sticker-text')); assert.ok(el._props['--st-ring']);
  ST.update(el, { steps: 4, radii: [0.1] }); assert.strictEqual(el._props['--st-ring'].split(',').length, 4);
});
t('apply and update never throw on null or bad arguments', function () {
  assert.strictEqual(ST.apply(null), null); assert.strictEqual(ST.apply(undefined), undefined);
  ST.apply({}); ST.apply('text'); ST.apply(5); ST.update(null); ST.update({}); ST.update(fakeEl('x'), { radii: 'no', steps: {}, outline: 7 });
  var evil = { setAttribute: function () { throw new Error('boom'); } }; assert.strictEqual(ST.apply(evil), evil); assert.strictEqual(ST.update(evil), evil);
  var el = fakeEl(null); ST.apply(el); assert.strictEqual(el.getAttribute('data-t'), '');
});
t('css gives the decorative copies empty alt text, with a plain content line first', function () {
  var i = css.indexOf('content: attr(data-t);'), j = css.indexOf('content: attr(data-t) / "";');
  assert.ok(i >= 0 && j > i);
});
t('css has a forced-colors block that shows the real text', function () {
  var m = css.match(/@media \(forced-colors: active\)\s*\{[\s\S]*?\n\}/); assert.ok(m, 'block missing');
  assert.ok(/color:\s*CanvasText/.test(m[0])); assert.ok(/::before[^{]*::after[^{]*\{[^}]*content:\s*none/.test(m[0]));
});

console.log('sticker-text: ' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
