/* sticker-text Node checks. Plain Node, no browser. Copyright (c) 2026 LFC Foundry. MIT License. */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path');
var ST = require('../sticker-text.js');
var css = fs.readFileSync(path.join(__dirname, '..', 'sticker-text.css'), 'utf8');
var nc = css.replace(/\/\*[\s\S]*?\*\//g, '');   // the stylesheet without its comments
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

t('ringShadow makes 32 zero-blur offsets in the given color (one ring)', function () {
  var s = ST.ringShadow('#fff7e3'); assert.strictEqual(s.split(',').length, 32); assert.ok(/ 0 #fff7e3/.test(s));
  assert.ok(s.split(',').every(function (e) { return /^-?0\.\d{3}em -?0\.\d{3}em 0 #fff7e3$/.test(e); }), 'every entry is x y 0 color in em');
});
t('ringShadow takes radii and steps', function () { assert.strictEqual(ST.ringShadow('red', [0.1], 8).split(',').length, 8); });
t('ringShadow falls back on bad arguments', function () {
  assert.strictEqual(ST.ringShadow(null, 'x', 'y').split(',').length, 32);
  assert.ok(/ 0 #fff7e3/.test(ST.ringShadow(undefined)));
  assert.strictEqual(ST.ringShadow('red', [NaN, -1, 'a'], -3).split(',').length, 32);
  assert.ok(ST.ringShadow('red', [0.1], 100000).split(',').length <= 96);
});
t('apply copies the text and adds the class, and leaves the default ring to the stylesheet', function () {
  var el = fakeEl('Bloop'); assert.strictEqual(ST.apply(el), el);
  assert.strictEqual(el.getAttribute('data-t'), 'Bloop'); assert.ok(el.classList.contains('sticker-text'));
  assert.strictEqual(el._props['--st-ring'], undefined, 'no inline ring unless radii or steps are given');
});
t('the stylesheet carries the default ring: 32 zero-blur shadows with no color, so they take the color of the outline copy', function () {
  var m = nc.match(/--st-ring:\s*([^;]*);/); assert.ok(m, '--st-ring missing');
  var list = m[1].split(',').map(function (e) { return e.trim(); }); assert.strictEqual(list.length, 32);
  assert.ok(list.every(function (e) { return /^-?\.?\d*\.?\d*(em)? -?\.?\d*\.?\d*(em)?$/.test(e) && e.indexOf('#') < 0 && e.indexOf('var(') < 0; }), 'two lengths each, no color');
  var js = ST.ringShadow('red').split(','), want = function (v) { return v === '0' ? 0 : parseFloat(v); };
  list.forEach(function (e, i) { var xy = e.split(' '), j = js[i].split(' '); assert.ok(Math.abs(want(xy[0]) - parseFloat(j[0])) < 0.0006 && Math.abs(want(xy[1]) - parseFloat(j[1])) < 0.0006, 'entry ' + i + ' matches ringShadow()'); });
  assert.ok(/::before\s*\{[^}]*color:\s*var\(--st-ring-color\)[^}]*text-shadow:\s*var\(--st-ring\)/.test(nc), 'the outline copy draws the ring in its own color');
});
t('apply with radii or steps writes its own ring', function () {
  var el = fakeEl('A'); ST.apply(el, { steps: 8 }); assert.strictEqual(el._props['--st-ring'].split(',').length, 8);
  var e2 = fakeEl('A'); ST.apply(e2, { radii: [0.05, 0.1], steps: 6 }); assert.strictEqual(e2._props['--st-ring'].split(',').length, 12);
});
t('the ring reads its color from a CSS variable, so --st-outline can recolor it', function () {
  var el = fakeEl('Bloop'); ST.apply(el, { outline: '#123456', steps: 12 });
  assert.ok(/ 0 currentColor/.test(el._props['--st-ring']));
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
  var el = fakeEl('X'); ST.update(el); assert.ok(el.classList.contains('sticker-text')); assert.strictEqual(el._props['--st-ring'], undefined);
  ST.update(el, { steps: 4, radii: [0.1] }); assert.strictEqual(el._props['--st-ring'].split(',').length, 4);
});
t('apply and update never throw on null or bad arguments', function () {
  assert.strictEqual(ST.apply(null), null); assert.strictEqual(ST.apply(undefined), undefined);
  ST.apply({}); ST.apply('text'); ST.apply(5); ST.update(null); ST.update({}); ST.update(fakeEl('x'), { radii: 'no', steps: {}, outline: 7 });
  var evil = { setAttribute: function () { throw new Error('boom'); } }; assert.strictEqual(ST.apply(evil), evil); assert.strictEqual(ST.update(evil), evil);
  var el = fakeEl(null); ST.apply(el); assert.strictEqual(el.getAttribute('data-t'), '');
});
t('watch keeps data-t current through a MutationObserver and stops when told', function () {
  var made = [], saved = global.MutationObserver;
  global.MutationObserver = function (cb) { this.cb = cb; this.opts = null; this.off = false; made.push(this); };
  global.MutationObserver.prototype.observe = function (el, o) { this.opts = o; };
  global.MutationObserver.prototype.disconnect = function () { this.off = true; };
  try {
    var el = fakeEl('Score 1'); el.nodeType = 1; var stop = ST.watch(el);
    assert.ok(el.classList.contains('sticker-text')); assert.strictEqual(made.length, 1);
    assert.deepStrictEqual(made[0].opts, { childList: true, characterData: true, subtree: true });
    el.textContent = 'Score 2'; made[0].cb([]); assert.strictEqual(el.getAttribute('data-t'), 'Score 2');
    stop(); assert.strictEqual(made[0].off, true); stop();
  } finally { global.MutationObserver = saved; }
});
t('watch without MutationObserver (Node, old browsers) applies once and returns a harmless stop function', function () {
  var el = fakeEl('A'); el.nodeType = 1; var saved = global.MutationObserver; delete global.MutationObserver;
  try { var stop = ST.watch(el); assert.strictEqual(typeof stop, 'function'); stop(); assert.ok(el.classList.contains('sticker-text')); }
  finally { if (saved) global.MutationObserver = saved; }
  assert.strictEqual(typeof ST.watch(null), 'function'); assert.strictEqual(typeof ST.watch({}), 'function'); assert.strictEqual(typeof ST.watch(undefined, { steps: 'x' }), 'function');
});
t('css: the copies are as wide as the element and inherit white-space and alignment, so text can wrap and use newlines', function () {
  var m = css.match(/\.sticker-text::before,\s*\.sticker-text::after\s*\{[^}]*\}/); assert.ok(m, 'copies rule missing');
  assert.ok(/inset:\s*-\.12em 0/.test(m[0]) && /white-space:\s*inherit/.test(m[0]) && /text-align:\s*inherit/.test(m[0]));
  assert.ok(!/white-space:\s*nowrap/.test(m[0]), 'the copies no longer force one line (the element still does)');
  assert.ok(/\.sticker-text\s*\{[^}]*white-space:\s*nowrap/.test(nc), 'the element keeps nowrap by default');
});
t('css: st-flat drops only the soft ground shadow, and forced colors still switch it off', function () {
  var m = css.match(/\.sticker-text\.st-flat\s*\{([^}]*)\}/); assert.ok(m, 'st-flat missing');
  assert.strictEqual((m[1].match(/drop-shadow/g) || []).length, 1); assert.ok(/var\(--st-edge\)/.test(m[1]));
  var f = css.match(/@media \(forced-colors: active\)\s*\{[\s\S]*?\n\}/)[0]; assert.ok(/\.sticker-text\.st-flat/.test(f));
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
