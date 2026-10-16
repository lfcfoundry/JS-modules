// Node checks for hold-press with a fake window, button and clock (no browser).
// Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node modules/hold-press/test/run.js   (HOLD_PRESS_FILE=/path/to/other.js tries another copy of the module)
var assert = require('assert'), path = require('path');
var pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' :: ' + (e && e.message)); }
}

// ---- fake clock (the module uses the global timer functions) ----
var clock = { now: 0, timers: [], nextId: 1 };
global.setTimeout = function (f, ms) { var t = { id: clock.nextId++, f: f, at: clock.now + (ms || 0), every: 0 }; clock.timers.push(t); return t.id; };
global.setInterval = function (f, ms) { var t = { id: clock.nextId++, f: f, at: clock.now + ms, every: ms }; clock.timers.push(t); return t.id; };
global.clearTimeout = global.clearInterval = function (id) { clock.timers = clock.timers.filter(function (t) { return t.id !== id; }); };
function advance(ms) {
  var end = clock.now + ms;
  for (;;) {
    var next = null;
    clock.timers.forEach(function (t) { if (t.at <= end && (!next || t.at < next.at)) next = t; });
    if (!next) break;
    clock.now = next.at;
    if (next.every) next.at += next.every; else clock.timers = clock.timers.filter(function (t) { return t !== next; });
    next.f();
  }
  clock.now = end;
}

// ---- fake event targets ----
function target() {
  var t = { list: {}, connected: true };
  t.addEventListener = function (type, f, opt) { (t.list[type] = t.list[type] || []).push({ f: f, capture: opt === true || !!(opt && opt.capture) }); };
  t.removeEventListener = function (type, f, opt) {
    var cap = opt === true || !!(opt && opt.capture);
    t.list[type] = (t.list[type] || []).filter(function (l) { return !(l.f === f && l.capture === cap); });
  };
  t.count = function () { var n = 0; for (var k in t.list) n += t.list[k].length; return n; };
  t.dispatch = function (type, props) {
    var e = props || {}; e.type = type; e.stopped = false;
    e.preventDefault = function () { e.prevented = true; };
    e.stopImmediatePropagation = function () { e.stopped = true; };
    var ls = (t.list[type] || []).slice();
    ls.filter(function (l) { return l.capture; }).concat(ls.filter(function (l) { return !l.capture; })).forEach(function (l) { if (!e.stopped) l.f(e); });
    return e;
  };
  return t;
}
function touch(id, x, y) { return { identifier: id, clientX: x, clientY: y }; }

var Module = require(process.env.HOLD_PRESS_FILE ? path.resolve(process.env.HOLD_PRESS_FILE) : '../hold-press.js');

// a fresh world: window, button (a 100 x 50 box at the top left), counters
function world(opts) {
  opts = opts || {};
  var w = target(); global.window = w;
  var el = target(); el.isConnected = true;
  el.getBoundingClientRect = function () { return { left: 0, top: 0, right: 100, bottom: 50 }; };
  var k = { presses: [], ends: 0, clicks: 0 };
  el.addEventListener('click', function () { k.clicks++; });          // the page's own click listener (added first, like a real page)
  // the page's listener must run AFTER hold-press's capture listener, as in a browser: dispatch() runs capture ones first
  var o = { onPress: function (i) { k.presses.push(i); }, onEnd: function () { k.ends++; } };
  for (var key in opts) o[key] = opts[key];
  var h = Module.attach(el, o);
  return { w: w, el: el, k: k, h: h };
}
function fingerDown(x, id) { return { changedTouches: [touch(id, x.x, x.y)], touches: [touch(id, x.x, x.y)] }; }
var IN = { x: 50, y: 25 }, OUT = { x: 400, y: 300 };

check('a tap does nothing but the normal click', function () {
  var W = world(); clock.now = 0; clock.timers = [];
  W.el.dispatch('touchstart', fingerDown(IN, 1)); advance(100);
  W.w.dispatch('touchend', { changedTouches: [touch(1, 50, 25)], touches: [] }); advance(1000);
  W.el.dispatch('click', { detail: 1 });
  assert.strictEqual(W.k.presses.length, 0); assert.strictEqual(W.k.clicks, 1);
  W.h.detach();
});

check('a touch hold repeats; info has x, y and count only (no mini)', function () {
  var W = world(); clock.timers = [];
  W.el.dispatch('touchstart', fingerDown(IN, 7)); advance(399); assert.strictEqual(W.k.presses.length, 0);
  advance(1); assert.strictEqual(W.k.presses.length, 1); advance(400); assert.strictEqual(W.k.presses.length, 3);
  assert.deepStrictEqual(Object.keys(W.k.presses[0]).sort(), ['count', 'x', 'y']); assert.strictEqual(W.k.presses[2].count, 3);
  W.w.dispatch('touchend', { changedTouches: [touch(7, 50, 25)], touches: [] }); W.h.detach();
});

check('a second finger lifting does not end the hold (identifier tracking)', function () {
  var W = world(); clock.timers = [];
  W.el.dispatch('touchstart', fingerDown(IN, 1)); advance(450);
  W.el.dispatch('touchstart', { changedTouches: [touch(2, 80, 40)], touches: [touch(1, 50, 25), touch(2, 80, 40)] });   // second finger on the button
  W.w.dispatch('touchend', { changedTouches: [touch(2, 80, 40)], touches: [touch(1, 50, 25)] });
  advance(400); assert.ok(W.h.holding); assert.ok(W.k.presses.length >= 3, 'still repeating: ' + W.k.presses.length);
  W.w.dispatch('touchend', { changedTouches: [touch(1, 50, 25)], touches: [] }); assert.ok(!W.h.holding); W.h.detach();
});

check('the first finger lifting ends the hold even though a second finger is still down', function () {
  var W = world(); clock.timers = [];
  W.el.dispatch('touchstart', fingerDown(IN, 1)); advance(450);
  W.el.dispatch('touchstart', { changedTouches: [touch(2, 80, 40)], touches: [touch(1, 50, 25), touch(2, 80, 40)] });
  W.w.dispatch('touchend', { changedTouches: [touch(1, 50, 25)], touches: [touch(2, 80, 40)] });
  var n = W.k.presses.length; advance(1000);
  assert.ok(!W.h.holding); assert.strictEqual(W.k.presses.length, n, 'no more presses after the lift'); assert.strictEqual(W.k.ends, 1); W.h.detach();
});

check('a second finger moving far away does not end the hold or count as sliding away', function () {
  var W = world({ zone: function (x, y) { return x < 200 && y < 100; } }); clock.timers = [];
  W.el.dispatch('touchstart', fingerDown(IN, 1)); advance(450);
  W.w.dispatch('touchmove', { changedTouches: [touch(2, 900, 900)], touches: [touch(1, 50, 25), touch(2, 900, 900)] });
  advance(400); assert.ok(W.h.holding, 'the hold survived the other finger moving outside the zone');
  W.w.dispatch('touchmove', { changedTouches: [touch(1, 500, 500)], touches: [touch(1, 500, 500), touch(2, 900, 900)] });
  assert.ok(!W.h.holding, 'the hold finger leaving the zone ends it'); W.h.detach();
});

check('before the hold starts, the holding finger sliding past the slop cancels it; another finger does not', function () {
  var W = world(); clock.timers = [];
  W.el.dispatch('touchstart', fingerDown(IN, 1)); advance(100);
  W.w.dispatch('touchmove', { changedTouches: [touch(2, 700, 700)], touches: [touch(1, 50, 25), touch(2, 700, 700)] });
  advance(400); assert.ok(W.k.presses.length >= 1, 'other finger moving did not cancel');
  W.w.dispatch('touchend', { changedTouches: [touch(1, 50, 25)], touches: [] });
  var V = world(); clock.timers = [];
  V.el.dispatch('touchstart', fingerDown(IN, 3)); V.w.dispatch('touchmove', { changedTouches: [touch(3, 120, 25)], touches: [touch(3, 120, 25)] }); advance(1000);
  assert.strictEqual(V.k.presses.length, 0, 'own finger sliding away cancelled the hold'); V.h.detach(); W.h.detach();
});

check('Android case: pointercancel from a touch does not end a touch hold', function () {
  var W = world(); clock.timers = [];
  W.el.dispatch('pointerdown', { pointerType: 'touch', pointerId: 5, isPrimary: true, clientX: 50, clientY: 25 });
  W.el.dispatch('touchstart', fingerDown(IN, 1)); advance(450);
  W.w.dispatch('pointercancel', { pointerType: 'touch', pointerId: 5, isPrimary: true, clientX: 0, clientY: 0 });
  advance(400); assert.ok(W.h.holding && W.k.presses.length >= 3);
  W.w.dispatch('touchend', { changedTouches: [touch(1, 50, 25)], touches: [] }); assert.ok(!W.h.holding); W.h.detach();
});

check('mouse hold: pointercancel ends it and no click is swallowed afterwards', function () {
  var W = world(); clock.timers = [];
  W.el.dispatch('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, isPrimary: true, clientX: 50, clientY: 25 }); advance(450);
  assert.ok(W.h.holding);
  W.w.dispatch('pointercancel', { pointerType: 'mouse', pointerId: 1, isPrimary: true, clientX: 0, clientY: 0 });
  assert.ok(!W.h.holding); W.el.dispatch('click', { detail: 1 }); assert.strictEqual(W.k.clicks, 1, 'the next click goes through'); W.h.detach();
});

function mouseHold(W, ms) {
  W.el.dispatch('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, isPrimary: true, clientX: 50, clientY: 25 }); advance(ms);
}
function mouseUp(W, x, y) { W.w.dispatch('pointerup', { pointerType: 'mouse', pointerId: 1, isPrimary: true, clientX: x, clientY: y }); }

check('after a hold, the release click is swallowed once; the next tap works', function () {
  var W = world(); clock.timers = [];
  mouseHold(W, 1000); mouseUp(W, 50, 25); W.el.dispatch('click', { detail: 1 }); assert.strictEqual(W.k.clicks, 0, 'release click swallowed');
  W.el.dispatch('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, isPrimary: true, clientX: 50, clientY: 25 }); mouseUp(W, 50, 25);
  W.el.dispatch('click', { detail: 1 }); assert.strictEqual(W.k.clicks, 1, 'the following tap is a normal click'); W.h.detach();
});

check('a hold that ends off the button does not eat the next tap', function () {
  var W = world(); clock.timers = [];
  mouseHold(W, 1000); mouseUp(W, OUT.x, OUT.y);
  W.el.dispatch('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, isPrimary: true, clientX: 50, clientY: 25 }); mouseUp(W, 50, 25);
  W.el.dispatch('click', { detail: 1 }); assert.strictEqual(W.k.clicks, 1); W.h.detach();
});

check('a hold that ends early and the press lasts over 700 ms: the release click is still swallowed', function () {
  var open = false, W = world({ canPress: function () { return !open; } }); clock.timers = [];
  mouseHold(W, 1000); assert.ok(W.k.presses.length >= 3);
  open = true; advance(300);                       // the next repeat finds canPress false and ends the hold
  assert.ok(!W.h.holding); advance(2000);          // finger stays down for seconds
  mouseUp(W, 50, 25); W.el.dispatch('click', { detail: 1 });
  assert.strictEqual(W.k.clicks, 0, 'release click swallowed, no extra press'); W.h.detach();
});

check('a keyboard or script click (detail 0) right after a hold is not swallowed', function () {
  var W = world(); clock.timers = [];
  mouseHold(W, 1000); mouseUp(W, 50, 25); W.el.dispatch('click', { detail: 0 }); assert.strictEqual(W.k.clicks, 1); W.h.detach();
});

check('the swallow is forgotten after 700 ms when no click comes', function () {
  var W = world(); clock.timers = [];
  mouseHold(W, 1000); mouseUp(W, 50, 25); advance(800); W.el.dispatch('click', { detail: 1 }); assert.strictEqual(W.k.clicks, 1); W.h.detach();
});

check('everyMs of 0 or less uses the default and does not spin', function () {
  var W = world({ everyMs: 0 }); clock.timers = [];
  mouseHold(W, 1000); assert.ok(W.k.presses.length >= 3 && W.k.presses.length <= 6, 'presses ' + W.k.presses.length);
  var V = world({ everyMs: -5 }); mouseHold(V, 1000); assert.ok(V.k.presses.length <= 6); W.h.detach(); V.h.detach();
});

check('a throwing onPress, onEnd or canPress never escapes', function () {
  var W = world({ onPress: function () { throw new Error('x'); }, onEnd: function () { throw new Error('y'); } }); clock.timers = [];
  mouseHold(W, 1000); mouseUp(W, 50, 25);
  var V = world({ onPress: undefined }); mouseHold(V, 1000); mouseUp(V, 50, 25);
  var U = world({ canPress: function () { throw new Error('z'); } }); mouseHold(U, 1000); mouseUp(U, 50, 25);
  W.h.detach(); V.h.detach(); U.h.detach();
});

check('a button removed from the page without detach(): window listeners and the repeat are cleaned up', function () {
  var W = world(); clock.timers = [];
  mouseHold(W, 1000); var n = W.k.presses.length; assert.ok(n >= 3 && W.w.count() > 0);
  W.el.isConnected = false; advance(500);
  assert.strictEqual(W.k.presses.length, n, 'no more presses'); assert.strictEqual(W.w.count(), 0, 'window listeners removed'); assert.strictEqual(W.el.count(), 1, 'only the page own click listener is left');
  var V = world(); V.el.isConnected = false; V.w.dispatch('pointermove', { pointerId: 1, clientX: 0, clientY: 0 }); assert.strictEqual(V.w.count(), 0, 'cleaned up on the next window event');
});

check('detach() removes every listener and stops a running hold', function () {
  var W = world(); clock.timers = [];
  mouseHold(W, 1000); W.h.detach(); assert.strictEqual(W.w.count(), 0); assert.strictEqual(W.el.count(), 1, 'only the page own click listener is left'); var n = W.k.presses.length; advance(1000); assert.strictEqual(W.k.presses.length, n);
  W.h.detach();   // twice is fine
});

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
