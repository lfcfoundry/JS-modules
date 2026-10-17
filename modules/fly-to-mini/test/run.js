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
    _rect: rect || { left: 0, top: 0, width: 0, height: 0 }, _hidden: false, children: [], parentNode: null, animates: [], _ids: [], _canvases: [], focused: 0, idRemoved: false,
    animate: function (k, o) { e.animates.push({ k: k, o: o }); },
    focus: function () { e.focused++; global.document.activeElement = e; },
    contains: function (x) { return x === e || e.children.indexOf(x) >= 0; },
    removeAttribute: function (a) { if (a === 'id') e.idRemoved = true; },
    querySelectorAll: function (sel) { return sel === '[id]' ? e._ids : (sel === 'canvas' ? e._canvases : []); },
    style: { visibility: '', setProperty: function (k, v) { this[k] = v; }, removeProperty: function (k) { delete this[k]; } },
    classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; } },
    getBoundingClientRect: function () { var r = e._rect; return e._hidden ? { left: 0, top: 0, width: 0, height: 0 } : { left: r.left, top: r.top, width: r.width, height: r.height }; },
    cloneNode: function () {
      var c = el(e._rect);
      c._ids = e._ids.map(function () { return el(); });
      c._canvases = e._canvases.map(function () { var cv = el(); cv.drawn = []; cv.getContext = function () { return { drawImage: function (src) { cv.drawn.push(src); } }; }; return cv; });
      return c;
    }, setAttribute: function () {},
    appendChild: function (c) { c.parentNode = e; e.children.push(c); return c; },
    removeChild: function (c) { e.children = e.children.filter(function (x) { return x !== c; }); c.parentNode = null; return c; }
  };
  Object.defineProperty(e, 'offsetWidth', { get: function () { return e._hidden ? 0 : e._rect.width; } });
  Object.defineProperty(e, 'firstElementChild', { get: function () { return e._face || (e._face = el(e._rect)); } });
  return e;
}

var IO = { last: null, all: [] };
var RO = { last: null };
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
    ResizeObserver: opts.ro ? function (cb) { RO.last = this; this.cb = cb; this.observe = function () {}; this.disconnect = function () { this.gone = true; }; } : undefined,
    matchMedia: function () { return { matches: !!opts.reduced }; },
    IntersectionObserver: function (cb, o) { this.cb = cb; this.opts = o; IO.last = this; this.observe = function () {}; this.disconnect = function () {}; }
  };
  global.IntersectionObserver = global.window.IntersectionObserver;
  global.ResizeObserver = global.window.ResizeObserver;
  IO.all = []; var RealIO = global.window.IntersectionObserver;
  global.window.IntersectionObserver = global.IntersectionObserver = function (cb, o) { RealIO.call(this, cb, o); IO.all.push(this); };
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

// ---- 1.2.0: fold-ins from Apple Press ----
var mkBar = function (h) { return el({ left: 0, top: 0, width: 400, height: h }); };
t('bar: the sticky bar sets the inset (and beats topInset), and the module follows its size', function () {
  var bar = mkBar(56), s = setup({ ro: true, extra: { bar: bar, topInset: 10 } });
  assert.strictEqual(IO.last.opts.rootMargin, '-56px 0px 0px 0px');
  var first = IO.last;
  RO.last.cb(); assert.strictEqual(IO.all.length, 1, 'same size: the observer is kept');
  bar._rect = { left: 0, top: 0, width: 400, height: 80 }; RO.last.cb();
  assert.strictEqual(IO.all.length, 2); assert.strictEqual(IO.last.opts.rootMargin, '-80px 0px 0px 0px');
  s.scroll(1); s.scroll(0.2); assert.strictEqual(s.fly.isMini, true);
  s.fly.destroy(); assert.ok(RO.last.gone, 'destroy stops watching the bar');
});
t('bar: after the observer is rebuilt the first report only sets the state (no flight)', function () {
  var bar = mkBar(56), s = setup({ ro: true, extra: { bar: bar } });
  s.scroll(1);
  bar._rect = { left: 0, top: 0, width: 400, height: 90 }; RO.last.cb();
  s.scroll(0.1); assert.strictEqual(s.fly.isMini, true); assert.strictEqual(flights(s).length, 0);
});
t('bar: a zero-height bar means no inset, and no ResizeObserver still works', function () {
  var s = setup({ extra: { bar: mkBar(0) } }); assert.strictEqual(IO.last.opts.rootMargin, '0px');
});
t('onVisible gets each report, steps are added to the observer, and a throwing callback changes nothing', function () {
  var seen = [], errs = []; var ce = console.error; console.error = function (e) { errs.push(e); };
  var s = setup({ extra: { steps: [0.97, 0.25, 'x', 2], onVisible: function (r) { seen.push(r); throw new Error('boom'); } } });
  console.error = ce;
  assert.deepStrictEqual(IO.last.opts.threshold, [0, 0.25, 0.5, 0.97, 1]);
  console.error = function () {}; s.scroll(1); s.scroll(0.2); console.error = ce;
  assert.deepStrictEqual(seen, [1, 0.2]); assert.strictEqual(s.fly.isMini, true);
});
t('hysteresis: it leaves at under half and comes back only above half plus the margin', function () {
  var s = setup({ extra: { hysteresis: 0.1 } });
  assert.ok(IO.last.opts.threshold.indexOf(0.6) >= 0);
  s.scroll(1); s.scroll(0.4); assert.strictEqual(s.fly.isMini, true);
  s.scroll(0.55); assert.strictEqual(s.fly.isMini, true, 'between 0.5 and 0.6 it stays');
  s.scroll(0.65); assert.strictEqual(s.fly.isMini, false);
  var plain = setup(); plain.scroll(1); plain.scroll(0.4); plain.scroll(0.55); assert.strictEqual(plain.fly.isMini, false, 'without it, back at once above half');
  var huge = setup({ extra: { hysteresis: 9 } }); assert.ok(IO.last.opts.threshold.indexOf(0.9) >= 0, 'the margin is capped at 0.4');
});
t('the newest observer report wins when several are waiting', function () {
  var s = setup(); s.scroll(1);
  IO.last.cb([{ intersectionRatio: 0.2 }, { intersectionRatio: 0.9 }]); assert.strictEqual(s.fly.isMini, false);
  IO.last.cb([{ intersectionRatio: 0.9 }, { intersectionRatio: 0.2 }]); assert.strictEqual(s.fly.isMini, true);
});
t('alert(): only while the mini shows, spaced out, class removed later, never during a flight', function () {
  var s = setup(); s.scroll(1);
  assert.strictEqual(s.fly.alert(), false, 'not showing yet');
  s.scroll(0.2); assert.strictEqual(s.fly.alert(), false, 'a flight is in the air'); advance(600);
  assert.strictEqual(s.fly.alert(), true); assert.ok(s.mini.classList.contains('mini-alert'));
  assert.strictEqual(s.fly.alert(), false, 'too soon'); advance(1900); assert.ok(!s.mini.classList.contains('mini-alert'));
  advance(1800); assert.strictEqual(s.fly.alert(), true, 'after the gap it works again');
  var calm = setup({ reduced: true }); calm.scroll(1); calm.scroll(0.2); assert.strictEqual(calm.fly.alert(), true);
  advance(2000); assert.ok(calm.mini.classList.contains('mini-alert'), 'calmer: it stays a little longer'); advance(1200); assert.ok(!calm.mini.classList.contains('mini-alert'));
  var hid = setup(); hid.scroll(1); hid.scroll(0.2); advance(600); document.hidden = true; assert.strictEqual(hid.fly.alert(), false); document.hidden = false;
  var inert = F0().create({}); assert.strictEqual(inert.alert(), false);
});
function F0() { return require('../fly-to-mini.js'); }
t('keepFocus: the button that goes away hands its focus to the other', function () {
  var s = setup({ extra: { keepFocus: true } }); s.scroll(1);
  document.activeElement = s.big; s.scroll(0.2); assert.strictEqual(s.mini.focused, 0, 'not before it lands'); advance(600);
  assert.strictEqual(s.mini.focused, 1); assert.strictEqual(document.activeElement, s.mini);
  s.scroll(0.9); advance(600); assert.strictEqual(s.big.focused, 1, 'back again: the big one takes it');
  var other = setup({ extra: { keepFocus: true } }); other.scroll(1); document.activeElement = null; other.scroll(0.2); advance(600);
  assert.strictEqual(other.mini.focused + other.big.focused, 0, 'focus somewhere else is left alone');
  var off = setup(); off.scroll(1); document.activeElement = off.big; off.scroll(0.2); advance(600); assert.strictEqual(off.mini.focused, 0, 'off unless asked for');
});
t('keepFocus: focus lost on the way (display:none) still lands on the right button; a reversal cancels it', function () {
  var s = setup({ miniHidden: true, hideWithChange: true, extra: { keepFocus: true } }); s.scroll(1);
  document.activeElement = s.big; s.scroll(0.2); document.activeElement = null; advance(600); assert.strictEqual(s.mini.focused, 1);
  var r = setup({ extra: { keepFocus: true } }); r.scroll(1); document.activeElement = r.big; r.scroll(0.2); r.scroll(0.9); advance(600);
  assert.strictEqual(r.mini.focused, 0, 'it went back before landing, so the focus stays on the big one');
});
t('keepFocus: also works without a flight (reduced motion, first report)', function () {
  var s = setup({ reduced: true, extra: { keepFocus: true } }); s.scroll(1); document.activeElement = s.big; s.scroll(0.2);
  assert.strictEqual(s.mini.focused, 1);
});
t('reducedFade: where the flight is skipped, the arriving element fades in; otherwise nothing', function () {
  var s = setup({ reduced: true, extra: { reducedFade: true } }); s.scroll(1); s.scroll(0.2);
  assert.strictEqual(s.mini.animates.length, 1); assert.strictEqual(s.mini.animates[0].k[0].opacity, 0); assert.strictEqual(s.mini.animates[0].o.duration, 150);
  s.scroll(0.9); assert.strictEqual(s.big.animates.length, 1);
  var off = setup({ reduced: true }); off.scroll(1); off.scroll(0.2); assert.strictEqual(off.mini.animates.length, 0);
  var first = setup({ reduced: true, extra: { reducedFade: true } }); first.scroll(0.2); assert.strictEqual(first.mini.animates.length, 0, 'the very first report is not animated');
  var flies = setup({ extra: { reducedFade: true } }); flies.scroll(1); flies.scroll(0.2); assert.strictEqual(flies.mini.animates.length, 0, 'a normal flight is not faded');
});
t('the flying copy loses its ids and gets a copy of any canvas', function () {
  var s = setup(); var face = s.mini.firstElementChild; face._ids = [el(), el()]; face._canvases = [el()];
  var fakeCanvasSrc = face._canvases[0];
  s.scroll(1); s.scroll(0.2);
  var copy = flights(s)[0].children[0];
  assert.ok(copy.idRemoved, 'the copy itself'); assert.ok(copy._ids.every(function (n) { return n.idRemoved; }), 'and everything inside it');
  assert.strictEqual(copy._canvases[0].drawn[0], fakeCanvasSrc, 'the canvas is drawn into the copy');
});
t('destroy() leaves no timers behind', function () {
  var s = setup(); s.scroll(1); s.scroll(0.2); advance(600); s.fly.alert(); s.fly.destroy();
  assert.strictEqual(clock.timers.length, 0);
});

console.log('fly-to-mini: ' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
