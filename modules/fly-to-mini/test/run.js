/* fly-to-mini Node checks: fake DOM, fake clock, no browser. Copyright (c) 2026 LFC Foundry. MIT License. */
'use strict';
var assert = require('assert');
var pass = 0, fail = 0;

// ---- fake clock, animation frames and DOM pieces ----
var clock = { now: 1000, timers: [], rafs: [], id: 0 };
global.performance = { now: function () { return clock.now; } };
global.setTimeout = function (f, ms) { var t = { id: ++clock.id, at: clock.now + (ms || 0), f: f }; clock.timers.push(t); return t.id; };
global.clearTimeout = function (id) { clock.timers = clock.timers.filter(function (t) { return t.id !== id; }); };
global.requestAnimationFrame = function (f) { var r = { id: ++clock.id, f: f }; clock.rafs.push(r); return r.id; };
global.cancelAnimationFrame = function (id) { clock.rafs = clock.rafs.filter(function (r) { return r.id !== id; }); };
// Moves time forward in 16 ms steps. dropFrames: timers run but animation frames never fire (a stalled or hidden page).
function advance(ms, dropFrames) {
  var end = clock.now + ms;
  while (clock.now < end) {
    clock.now += 16;
    if (!dropFrames) { var rs = clock.rafs; clock.rafs = []; rs.forEach(function (r) { r.f(clock.now); }); }
    var due = clock.timers.filter(function (t) { return t.at <= clock.now; });
    clock.timers = clock.timers.filter(function (t) { return t.at > clock.now; });
    due.forEach(function (t) { t.f(); });
  }
}
function reset() { clock.timers = []; clock.rafs = []; clock.now = 1000; }

function el(rect) {
  var cls = {}, e = {
    _rect: rect || { left: 0, top: 0, width: 0, height: 0 }, _hidden: false, children: [], parentNode: null, animate: function () {},
    style: { visibility: '', setProperty: function (k, v) { this[k] = v; }, removeProperty: function (k) { delete this[k]; } },
    classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; } },
    getBoundingClientRect: function () { var r = e._rect; return e._hidden ? { left: 0, top: 0, width: 0, height: 0 } : { left: r.left, top: r.top, width: r.width, height: r.height }; },
    cloneNode: function () { return el(e._rect); }, setAttribute: function () {},
    appendChild: function (c) { c.parentNode = e; e.children.push(c); return c; },
    removeChild: function (c) { e.children = e.children.filter(function (x) { return x !== c; }); c.parentNode = null; return c; }
  };
  Object.defineProperty(e, 'offsetWidth', { get: function () { return e._hidden ? 0 : e._rect.width; } });
  Object.defineProperty(e, 'firstElementChild', { get: function () { return e._face || (e._face = el(e._rect)); } });
  return e;
}

var IO = { last: null };
var vtLog = { all: [], wobbles: [] };
function thenable() { var th = { ok: null, bad: null, then: function (a, b) { th.ok = a; th.bad = b; } }; return th; }
function setup(opts) {
  opts = opts || {};
  reset(); vtLog = { all: [], wobbles: [] };
  var body = el();
  global.document = { hidden: false, body: body, createElement: function () { var d = el({ left: 0, top: 0, width: 0, height: 0 }); return d; } };
  if (opts.vt) {   // a fake View Transitions API: the test settles it by hand
    global.document.documentElement = el(); global.document.head = el(); global.document.documentElement.animate = function (k, o) { vtLog.wobbles.push(o.pseudoElement); };
    global.document.startViewTransition = function (cb) {
      var tr = { cb: cb, skipped: false, skipTransition: function () { tr.skipped = true; }, ready: thenable(), finished: thenable() };
      vtLog.all.push(tr); return tr;
    };
  }
  global.window = {
    innerHeight: 700,
    matchMedia: function () { return { matches: !!opts.reduced }; },
    IntersectionObserver: function (cb, o) { this.cb = cb; this.opts = o; IO.last = this; this.observe = function () {}; this.disconnect = function () {}; }
  };
  global.IntersectionObserver = global.window.IntersectionObserver;
  delete require.cache[require.resolve('../fly-to-mini.js')];
  var F = require('../fly-to-mini.js');
  var big = el({ left: 100, top: 200, width: 180, height: 180 });
  var mini = el({ left: 300, top: 8, width: 40, height: 40 });
  mini._hidden = !!opts.miniHidden;            // like display:none: no size, no rect
  var changes = [];
  var cfg = { big: big, mini: mini, topInset: 56, onChange: function (on) { changes.push(on); if (opts.hideWithChange) mini._hidden = !on; if (opts.onChange) opts.onChange(on); } };
  for (var k in (opts.extra || {})) cfg[k] = opts.extra[k];
  var fly = F.create(cfg);
  function scroll(ratio) { IO.last.cb([{ intersectionRatio: ratio }]); }
  return { F: F, fly: fly, big: big, mini: mini, changes: changes, body: body, scroll: scroll, cfg: cfg };
}
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL ' + name + ': ' + (e && e.stack || e)); } }
var flights = function (s) { return s.body.children.filter(function (c) { return c.className === 'mini-fly'; }); };

// ---- checks ----
t('a mini hidden with display:none still gets a flight down, and it lands', function () {
  var s = setup({ miniHidden: true, hideWithChange: true });
  s.scroll(1); s.scroll(0.2);
  assert.strictEqual(flights(s).length, 1, 'a copy must be in the air');
  assert.ok(s.big.classList.contains('flying'));
  assert.strictEqual(s.mini.style.visibility, 'hidden', 'the mini is laid out but invisible during the flight');
  advance(160); assert.strictEqual(flights(s).length, 1, 'still flying after 160 ms');
  advance(500);
  assert.strictEqual(flights(s).length, 0); assert.ok(!s.big.classList.contains('flying'));
  assert.strictEqual(s.mini.style.visibility, '', 'visibility restored'); assert.strictEqual(s.changes[s.changes.length - 1], true);
  assert.strictEqual(s.fly.isMini, true); assert.ok(s.mini.classList.contains('landed'));
});
t('the flight back up works when the page hides the mini with display:none', function () {
  var s = setup({ miniHidden: true, hideWithChange: true });
  s.scroll(1); s.scroll(0.2); advance(600);
  s.scroll(0.9);
  assert.strictEqual(flights(s).length, 1, 'copy in the air');
  advance(160); assert.strictEqual(flights(s).length, 1, 'does not land on the first frame');
  advance(500); assert.strictEqual(flights(s).length, 0); assert.strictEqual(s.changes[s.changes.length - 1], false);
  assert.ok(!s.big.classList.contains('flying')); assert.strictEqual(s.fly.isMini, false);
});
t('a mini that never gets a box (hidden by the page itself) just changes state', function () {
  var s = setup({ miniHidden: true });   // onChange does not show it
  s.scroll(1); s.scroll(0.2);
  assert.strictEqual(flights(s).length, 0); assert.strictEqual(s.mini.style.visibility, ''); assert.strictEqual(s.fly.isMini, true);
  assert.ok(!s.big.classList.contains('flying'));
});
t('a mini kept laid out (visibility or opacity) flies as before', function () {
  var s = setup({});
  s.scroll(1); s.scroll(0.2); assert.strictEqual(flights(s).length, 1); assert.strictEqual(s.changes.join(), 'false', 'only the hide call at the start');
  advance(600); assert.strictEqual(flights(s).length, 0); assert.strictEqual(s.changes.join(), 'false,true');
});
t('a frame that throws lands the copy at once and leaves no invisible art', function () {
  var s = setup({});
  s.scroll(1); s.scroll(0.2); assert.ok(s.big.classList.contains('flying'));
  s.big.getBoundingClientRect = function () { throw new Error('element removed'); };
  advance(64);
  assert.strictEqual(flights(s).length, 0); assert.ok(!s.big.classList.contains('flying')); assert.strictEqual(s.changes[s.changes.length - 1], true);
});
t('the failsafe timer lands the copy when animation frames stop coming', function () {
  var s = setup({});
  s.scroll(1); s.scroll(0.2); assert.strictEqual(flights(s).length, 1);
  advance(200, true); assert.strictEqual(flights(s).length, 1, 'not yet');
  advance(600, true);
  assert.strictEqual(flights(s).length, 0); assert.ok(!s.big.classList.contains('flying')); assert.strictEqual(s.changes[s.changes.length - 1], true);
});
t('reduced motion: no flight, the state still changes', function () {
  var s = setup({ reduced: true });
  s.scroll(1); s.scroll(0.2);
  assert.strictEqual(flights(s).length, 0); assert.ok(!s.big.classList.contains('flying')); assert.strictEqual(s.changes[s.changes.length - 1], true); assert.strictEqual(s.fly.isMini, true);
});
t('canAnimate given by the caller overrides the reduced-motion default', function () {
  var s = setup({ reduced: true, extra: { canAnimate: function () { return true; } } });
  s.scroll(1); s.scroll(0.2); assert.strictEqual(flights(s).length, 1);
});
t('a frame time earlier than the start time does not move the copy backwards', function () {
  var s = setup({});
  s.scroll(1); s.scroll(0.2);
  var first = flights(s)[0].style.transform;
  var r = clock.rafs.shift(); r.f(clock.now - 5);   // a frame stamped a little before performance.now() at start
  assert.strictEqual(flights(s)[0].style.transform, first, 'progress is clamped at 0, so nothing moves');
  assert.ok(first.indexOf('NaN') < 0);
});
t('create() with bad setup does not throw and returns a no-op object', function () {
  [undefined, null, {}, { big: null, mini: null }, { big: {}, mini: {} }, 5, 'x'].forEach(function (bad) {
    var F = setup({}).F, f = F.create(bad);
    assert.strictEqual(typeof f.set, 'function'); assert.strictEqual(typeof f.stop, 'function'); assert.strictEqual(typeof f.destroy, 'function');
    f.set(true, true); f.set(false); f.stop(); f.destroy(); assert.strictEqual(f.isMini, false);
  });
  var seen = []; var F2 = setup({}).F; var g = F2.create({ onChange: function (v) { seen.push(v); } }); g.set(true); assert.deepStrictEqual(seen, [true]);
});
t('create() without a window (plain Node) does not throw', function () {
  delete global.window; delete global.document; delete require.cache[require.resolve('../fly-to-mini.js')];
  var F = require('../fly-to-mini.js'); var f = F.create({ big: el(), mini: el() }); f.set(true); f.destroy();
});
t('a throwing onChange does not break the landing', function () {
  var calls = 0, s = setup({ onChange: function () { calls++; throw new Error('caller bug'); } });
  var oldErr = console.error; console.error = function () {};
  try { s.scroll(1); s.scroll(0.2); advance(600); } finally { console.error = oldErr; }
  assert.strictEqual(flights(s).length, 0); assert.ok(!s.big.classList.contains('flying')); assert.ok(calls >= 2);
});
t('topInset sets the observer margin (default 130, 0 means none)', function () {
  setup({}); assert.strictEqual(IO.last.opts.rootMargin, '-56px 0px 0px 0px');
  setup({ extra: { topInset: undefined } }); assert.strictEqual(IO.last.opts.rootMargin, '-130px 0px 0px 0px');
  setup({ extra: { topInset: 0 } }); assert.strictEqual(IO.last.opts.rootMargin, '0px');
});
t('destroy mid-flight removes the copy and the flying class', function () {
  var s = setup({ miniHidden: true, hideWithChange: true });
  s.scroll(1); s.scroll(0.2); s.fly.destroy();
  assert.strictEqual(flights(s).length, 0); assert.ok(!s.big.classList.contains('flying')); assert.strictEqual(s.mini.style.visibility, '');
});
t('a flight cut short by scrolling back ends cleanly', function () {
  var s = setup({ miniHidden: true, hideWithChange: true });
  s.scroll(1); s.scroll(0.2); advance(100); s.scroll(0.9); advance(800);
  assert.strictEqual(flights(s).length, 0); assert.ok(!s.big.classList.contains('flying')); assert.strictEqual(s.fly.isMini, false); assert.strictEqual(s.changes[s.changes.length - 1], false);
});

// ---- optional View Transitions engine ----
var NAME = 'view-transition-name';
t('engine "transition" uses the browser: names the old picture, swaps the name in the update callback, never makes a copy', function () {
  var s = setup({ vt: true, miniHidden: true, hideWithChange: true, extra: { engine: 'transition' } });
  s.scroll(1); s.scroll(0.2);
  assert.strictEqual(vtLog.all.length, 1); assert.strictEqual(flights(s).length, 0, 'no flying copy');
  assert.strictEqual(s.big.style[NAME], 'fly-to-mini', 'the big art carries the name while the old state is captured');
  assert.ok(!s.big.classList.contains('flying'), 'the big art stays visible, so the new picture is not blank on the way up');
  assert.strictEqual(s.changes.length, 0, 'the page changes only inside the callback');
  vtLog.all[0].cb();
  assert.strictEqual(s.big.style[NAME], undefined); assert.strictEqual(s.mini.firstElementChild.style[NAME], 'fly-to-mini');
  assert.strictEqual(s.changes.join(), 'true'); assert.strictEqual(s.fly.isMini, true);
  vtLog.all[0].ready.ok(); assert.strictEqual(vtLog.wobbles[0], '::view-transition-group(fly-to-mini)', 'tilt and squash are added to the group');
  vtLog.all[0].finished.ok();
  assert.strictEqual(s.mini.firstElementChild.style[NAME], undefined, 'no name left behind'); assert.strictEqual(document.head.children[0].textContent, '', 'the page-wide style is emptied');
  assert.ok(s.mini.classList.contains('landed'));
});
t('engine "transition": a move cut short by scrolling back leaves the final state and no stale names', function () {
  var s = setup({ vt: true, miniHidden: true, hideWithChange: true, extra: { engine: 'transition' } });
  s.scroll(1); s.scroll(0.2);               // down; the first callback has not run yet
  s.scroll(0.9);                            // back up at once
  assert.strictEqual(vtLog.all.length, 2);
  vtLog.all[0].cb(); assert.strictEqual(s.changes.length, 0, 'the retired move does nothing');
  vtLog.all[1].cb(); assert.strictEqual(s.changes.join(), 'false'); assert.strictEqual(s.fly.isMini, false);
  assert.strictEqual(s.big.style[NAME], 'fly-to-mini'); assert.strictEqual(s.mini.firstElementChild.style[NAME], undefined);
  vtLog.all[0].finished.ok(); assert.strictEqual(s.big.style[NAME], 'fly-to-mini', 'a retired move must not clear the live one');
  vtLog.all[1].finished.ok(); assert.strictEqual(s.big.style[NAME], undefined);
});
t('engine "transition" falls back to the flight where startViewTransition is missing', function () {
  var s = setup({ extra: { engine: 'transition' } });   // no vt in this fake
  s.scroll(1); s.scroll(0.2); assert.strictEqual(flights(s).length, 1); advance(600); assert.strictEqual(flights(s).length, 0);
});
t('engine "transition": reduced motion skips it, and a throwing startViewTransition still changes the state', function () {
  var s = setup({ vt: true, reduced: true, extra: { engine: 'transition' } });
  s.scroll(1); s.scroll(0.2); assert.strictEqual(vtLog.all.length, 0); assert.strictEqual(s.fly.isMini, true); assert.strictEqual(s.changes[s.changes.length - 1], true);
  var s2 = setup({ vt: true, extra: { engine: 'transition' } }); document.startViewTransition = function () { throw new Error('nope'); };
  s2.scroll(1); s2.scroll(0.2); assert.strictEqual(s2.fly.isMini, true); assert.strictEqual(s2.changes[s2.changes.length - 1], true); assert.ok(!s2.big.style[NAME]);
});
t('engine "transition": stop() and destroy() skip the move and clear the names and the style', function () {
  var s = setup({ vt: true, extra: { engine: 'transition', transitionName: 'my name!' } });
  s.scroll(1); s.scroll(0.2); assert.strictEqual(s.big.style[NAME], 'myname', 'odd characters are stripped from the name');
  s.fly.stop(); assert.ok(vtLog.all[0].skipped); assert.strictEqual(s.big.style[NAME], undefined);
  s.scroll(0.9); s.fly.destroy(); assert.strictEqual(document.head.children.length, 0, 'the <style> is removed');
});

console.log('fly-to-mini: ' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
