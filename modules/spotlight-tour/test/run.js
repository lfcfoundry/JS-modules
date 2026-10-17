/* Copyright (c) 2026 LFC Foundry. MIT License. Checks for spotlight-tour's layout maths (Node). The tour itself is checked in a real browser by tests/pieces-browser.js. */
'use strict';
var assert = require('assert'), S = require('../spotlight-tour.js'), fail = 0, pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); } }
var view = { w: 400, h: 800 }, card = { w: 300, h: 160 };
t('the card goes below the part when there is room, centered on it and kept inside the window', function () {
  var L = S.layout({ left: 150, top: 100, right: 250, bottom: 150 }, card, view, 12);
  assert.deepStrictEqual(L.hole, { l: 144, t: 94, w: 112, h: 62 }); assert.strictEqual(L.y, 156 + 12); assert.strictEqual(L.x, 200 - 150);
  var edge = S.layout({ left: 0, top: 100, right: 40, bottom: 150 }, card, view, 12); assert.strictEqual(edge.x, 12, 'clamped to the left margin');
  var right = S.layout({ left: 360, top: 100, right: 400, bottom: 150 }, card, view, 12); assert.strictEqual(right.x, 400 - 300 - 12);
});
t('the card goes above the part when below is full', function () {
  var L = S.layout({ left: 100, top: 600, right: 300, bottom: 700 }, card, view, 12); assert.ok(L.y + card.h <= L.hole.t, 'above the window'); assert.strictEqual(L.y, 594 - 160 - 12);
});
t('a tall part: the card sits at the bottom and the window shrinks to fit above it (never under 40 pixels)', function () {
  var L = S.layout({ left: 10, top: 20, right: 390, bottom: 790 }, card, view, 12);
  assert.strictEqual(L.y, 800 - 160 - 12); assert.ok(L.hole.t + L.hole.h <= L.y - 12, 'window ends above the card');
  var squeezed = S.layout({ left: 10, top: 500, right: 390, bottom: 790 }, { w: 300, h: 600 }, view, 12); assert.ok(squeezed.hole.h >= 40);
});
t('no part, or a part that is out of the window: centered card and no window', function () {
  var c = S.layout(null, card, view, 12); assert.strictEqual(c.hole, null); assert.deepStrictEqual([c.x, c.y], [50, 320]);
  assert.strictEqual(S.layout({ left: 10, top: -500, right: 100, bottom: 5 }, card, view, 12).hole, null, 'only 5 px showing');
  assert.strictEqual(S.layout({ left: 390, top: 100, right: 900, bottom: 200 }, card, view, 12).hole, null, 'only 10 px wide showing');
});
t('a part partly out of the window is clipped to what shows', function () {
  var L = S.layout({ left: -100, top: 700, right: 200, bottom: 1000 }, card, view, 12); assert.strictEqual(L.hole.l, -6); assert.strictEqual(L.hole.w, 200 + 12);
});
console.log(fail ? fail + ' FAILED, ' + pass + ' passed' : 'spotlight-tour: all ' + pass + ' checks passed');
process.exit(fail ? 1 : 0);
