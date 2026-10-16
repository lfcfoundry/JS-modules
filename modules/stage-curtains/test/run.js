/* stage-curtains Node checks: fake DOM, fake clock, no browser. Copyright (c) 2026 LFC Foundry. MIT License. */
'use strict';
var assert = require('assert');
var pass = 0, fail = 0;

// ---- fake clock (timers only; painting uses the real performance.now) ----
var clock = { now: 0, timers: [], id: 0 };
global.setTimeout = function (f, ms) { var t = { id: ++clock.id, at: clock.now + (ms || 0), f: f }; clock.timers.push(t); return t.id; };
global.clearTimeout = function (id) { clock.timers = clock.timers.filter(function (t) { return t.id !== id; }); };
function advance(ms) {
  var end = clock.now + ms;
  while (clock.now < end) {
    clock.now += 16;
    var due = clock.timers.filter(function (t) { return t.at <= clock.now; });
    clock.timers = clock.timers.filter(function (t) { return t.at > clock.now; });
    due.forEach(function (t) { t.f(); });
  }
}
// Runs microtasks and fake time until the promise settles or maxMs of fake time has passed.
async function settle(p, maxMs) {
  var r = { done: false, threw: false, val: undefined };
  p.then(function (v) { r.done = true; r.val = v; }, function (e) { r.done = true; r.threw = true; r.val = e; });
  for (var t = 0; !r.done && t < (maxMs || 20000); t += 16) { await new Promise(function (f) { setImmediate(f); }); advance(16); }
  await new Promise(function (f) { setImmediate(f); });
  return r;
}
async function tick(ms) { for (var t = 0; t < ms; t += 16) { await new Promise(function (f) { setImmediate(f); }); advance(16); } }

// ---- fake DOM ----
var ANIMS = [];
function node(tag) {
  var n = {
    tagName: tag.toUpperCase(), style: { cssText: '' }, children: [], parentNode: null, _attrs: {}, className: '',
    appendChild: function (c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = n; n.children.push(c); return c; },
    removeChild: function (c) { n.children = n.children.filter(function (x) { return x !== c; }); c.parentNode = null; return c; },
    setAttribute: function (k, v) { n._attrs[k] = String(v); }, removeAttribute: function (k) { delete n._attrs[k]; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(n._attrs, k); }, getAttribute: function (k) { return n._attrs[k]; },
    animate: function (frames, o) {
      var a = { frames: frames, opts: o, target: n, cancelled: false, onfinish: null, cancel: function () { a.cancelled = true; }, finish: function () { if (!a.cancelled && a.onfinish) a.onfinish(); } };
      ANIMS.push(a); return a;
    },
    clientWidth: 0, clientHeight: 0
  };
  if (tag === 'canvas') n.getContext = function () {
    if (env.noContext) return null;
    var fs = '#000000';
    return {
      createImageData: function (w, h) { if (env.badImageData) throw new Error('out of memory'); return { data: new Uint8ClampedArray(w * h * 4) }; },
      getImageData: function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData: function () {}, drawImage: function () {}, translate: function () {}, scale: function () {},
      get fillStyle() { return fs; }, set fillStyle(v) { var names = { red: '#ff0000' }; if (names[v]) fs = names[v]; else if (/^#[0-9a-f]{6}$/i.test(v)) fs = v; }
    };
  };
  return n;
}
var env = {};
function Image() { var im = this; Object.defineProperty(im, 'src', { set: function () { setTimeout(function () { if (im.onload) im.onload(); }, 0); } }); }
function setup(o) {
  o = o || {};
  env = { noContext: !!o.noContext, badImageData: !!o.badImageData };
  clock.timers = []; ANIMS.length = 0;
  global.Image = Image;
  global.document = { body: node('body'), createElement: node };
  global.window = { innerWidth: 60, innerHeight: 40, devicePixelRatio: 1, getComputedStyle: function (el) { return el._cs || { transform: 'none', opacity: '1' }; },
    matchMedia: function () { return { matches: !!o.reduced }; } };
  if (o.idle) global.window.requestIdleCallback = function (f) { return setTimeout(function () { f({ timeRemaining: function () { return 50; }, didTimeout: false }); }, 0); };
  delete require.cache[require.resolve('../stage-curtains.js')];
  var SC = require('../stage-curtains.js');
  var cfg = { container: global.document.body, width: 60, height: 40 };
  for (var k in (o.opts || {})) cfg[k] = o.opts[k];
  return { SC: SC, c: SC.create(cfg), body: global.document.body };
}
var tests = [];
function t(name, fn) { tests.push({ name: name, fn: fn }); }
var animsOn = function (el) { return ANIMS.filter(function (a) { return a.target === el; }); };
function halves(c) { return c.element.children.slice(0, 2); }

t('prepare() finishes without requestIdleCallback (the Safari case)', async function () {
  var s = setup({}); var r = await settle(s.c.prepare(), 15000);
  assert.ok(r.done, 'prepare() never finished'); assert.ok(!r.threw); assert.strictEqual(s.c.isReady, true);
});
t('prepare() finishes with requestIdleCallback too', async function () {
  var s = setup({ idle: true }); var r = await settle(s.c.prepare(), 15000);
  assert.ok(r.done && !r.threw); assert.strictEqual(s.c.isReady, true);
});
t('destroy() right after prepare() starts does not reject', async function () {
  var s = setup({}); var p = s.c.prepare(); s.c.destroy(); var r = await settle(p, 15000);
  assert.ok(r.done, 'did not settle'); assert.ok(!r.threw, 'rejected: ' + (r.val && r.val.message));
});
t('destroy() later in prepare() (after the velvet is painted) does not reject', async function () {
  var s = setup({ idle: true }); var p = s.c.prepare();
  await tick(300); s.c.destroy(); var r = await settle(p, 15000);
  assert.ok(r.done && !r.threw, 'rejected: ' + (r.val && r.val.message));
});
t('close() resolves with both halves in place and the finished animation is NOT cancelled', async function () {
  var s = setup({ idle: true }); var p = s.c.close(); await tick(400);
  var hs = halves(s.c); ANIMS.forEach(function (a) { a.finish(); });
  var r = await settle(p, 3000); assert.ok(r.done && !r.threw);
  assert.deepStrictEqual(hs.map(function (h) { return h.style.transform; }), ['translateX(0)', 'translateX(0)']);
  hs.forEach(function (h) { animsOn(h).forEach(function (a) { assert.strictEqual(a.cancelled, false, 'a finished slide was cancelled'); }); });
  assert.strictEqual(s.c.isClosed, true); assert.ok(s.body.children.indexOf(s.c.element) >= 0);
});
t('a stalled animation still ends in place (the timer writes the end position)', async function () {
  var s = setup({ idle: true }); var p = s.c.close(); await tick(300);
  var hs = halves(s.c); ANIMS.forEach(function (a) { a.cancel(); });
  var r = await settle(p, 4000); assert.ok(r.done);
  assert.deepStrictEqual(hs.map(function (h) { return h.style.transform; }), ['translateX(0)', 'translateX(0)']);
});
t('a second close() resolves only when the curtains are in place', async function () {
  var s = setup({ idle: true }); var p1 = s.c.close(); await tick(300);
  var p2 = s.c.close(), done2 = false; p2.then(function () { done2 = true; });
  await tick(100); assert.strictEqual(done2, false, 'second close() resolved while the curtains were still moving');
  ANIMS.forEach(function (a) { a.finish(); }); var r = await settle(p2, 3000); assert.ok(r.done); await settle(p1, 1000);
  assert.strictEqual(s.body.children.filter(function (c) { return c === s.c.element; }).length, 1, 'only one curtain in the page');
  var again = await settle(s.c.close(), 1000); assert.ok(again.done, 'close() after it finished resolves');
});
t('open() while closing turns around from where the halves are, with no jump', async function () {
  var s = setup({ idle: true }); var p = s.c.close(); await tick(300);
  var hs = halves(s.c);
  hs[0]._cs = { transform: 'matrix(1, 0, 0, 1, -50, 0)', opacity: '1' }; hs[1]._cs = { transform: 'matrix(1, 0, 0, 1, 60.5, 0)', opacity: '1' };
  var before = ANIMS.length; var op = s.c.open();
  assert.strictEqual(hs[0].style.transform, 'translateX(-50px)'); assert.strictEqual(hs[1].style.transform, 'translateX(60.5px)');
  var mine = ANIMS.slice(before);
  assert.strictEqual(mine.filter(function (a) { return a.target === hs[0]; })[0].frames[0].transform, 'translateX(-50px)');
  assert.strictEqual(mine.filter(function (a) { return a.target === hs[1]; })[0].frames[0].transform, 'translateX(60.5px)');
  ANIMS.slice(0, before).forEach(function (a) { if (a.target === hs[0] || a.target === hs[1]) assert.strictEqual(a.cancelled, true, 'the close slide must stop'); });
  await tick(1500);   // longer than the old close timers (760 + 400): they must not drag the halves to the closed place
  assert.strictEqual(hs[0].style.transform, 'translateX(-50px)', 'a stale close timer moved the half');
  var r = await settle(op, 4000); assert.ok(r.done && !r.threw); assert.strictEqual(s.c.isClosed, false); assert.strictEqual(s.body.children.indexOf(s.c.element), -1);
  assert.ok((await settle(p, 100)).done);
});
t('open() normally starts from the closed place and removes the curtain', async function () {
  var s = setup({ idle: true }); var p = s.c.close(); await tick(300); ANIMS.forEach(function (a) { a.finish(); }); await settle(p, 1000);
  var before = ANIMS.length, el = s.c.element, op = s.c.open();
  var mine = ANIMS.slice(before); assert.ok(mine.length >= 3);
  assert.ok(mine.some(function (a) { return a.target === el && a.frames[0].transform === 'scale(1)'; }), 'fly-through grows the whole curtain');
  mine[mine.length - 1].finish(); var r = await settle(op, 2000); assert.ok(r.done); assert.strictEqual(s.body.children.indexOf(el), -1); assert.strictEqual(s.c.isClosed, false);
  var op2 = await settle(s.c.open(), 100); assert.ok(op2.done, 'open() when already open resolves');
});
t('open() called twice returns the same running open', async function () {
  var s = setup({ idle: true }); var p = s.c.close(); await tick(300); ANIMS.forEach(function (a) { a.finish(); }); await settle(p, 1000);
  var o1 = s.c.open(), o2 = s.c.open(); assert.strictEqual(o1, o2);
});
t('no canvas context: prepare, close and open resolve and no curtain is shown', async function () {
  var s = setup({ noContext: true, idle: true });
  var a = await settle(s.c.prepare(), 2000), b = await settle(s.c.close(), 2000), c = await settle(s.c.open(), 2000);
  [a, b, c].forEach(function (r) { assert.ok(r.done && !r.threw); });
  assert.strictEqual(s.body.children.length, 0); assert.strictEqual(s.c.isReady, false); assert.strictEqual(s.c.isClosed, false);
});
t('painting that throws midway also resolves and skips the curtain', async function () {
  var s = setup({ badImageData: true });
  var b = await settle(s.c.close(), 3000); assert.ok(b.done && !b.threw); assert.strictEqual(s.body.children.length, 0);
  var o = await settle(s.c.open(), 1000); assert.ok(o.done);
});
t('the curtain is hidden from screen readers while it is up (any mode)', async function () {
  var s = setup({ idle: true }); var p = s.c.close(); await tick(300);
  assert.strictEqual(s.c.element.getAttribute('aria-hidden'), 'true'); s.c.destroy();
});
t('calm mode: fade in and out, no slide, no zoom', async function () {
  var s = setup({ idle: true, reduced: true }); var p = s.c.close(); await tick(300);
  var el = s.c.element, hs = halves(s.c);
  assert.deepStrictEqual(hs.map(function (h) { return h.style.transform; }), ['translateX(0)', 'translateX(0)']);
  assert.strictEqual(animsOn(hs[0]).length + animsOn(hs[1]).length, 0, 'halves must not slide');
  var fades = animsOn(el); assert.strictEqual(fades.length, 1); assert.strictEqual(fades[0].frames[0].opacity, 0); assert.strictEqual(fades[0].frames[1].opacity, 1);
  assert.ok(fades[0].frames.every(function (f) { return !f.transform; }));
  fades[0].finish(); await settle(p, 1000); assert.strictEqual(el.style.opacity, '1');
  var before = ANIMS.length, op = s.c.open(); var mine = ANIMS.slice(before);
  assert.strictEqual(mine.length, 1); assert.ok(mine[0].frames.every(function (f) { return !f.transform; }), 'no zoom in calm mode');
  mine[0].finish(); assert.ok((await settle(op, 1000)).done);
});
t('calm mode: the page behind is inert while closed and restored after open and after destroy', async function () {
  var s = setup({ idle: true, reduced: true }); var a = node('div'), b = node('button'), pre = node('div'); pre.setAttribute('inert', ''); s.body.appendChild(a); s.body.appendChild(b); s.body.appendChild(pre);
  var p = s.c.close(); await tick(300);
  assert.ok(a.hasAttribute('inert') && b.hasAttribute('inert')); assert.ok(!s.c.element.hasAttribute('inert'), 'the curtain itself is not inert');
  var late = node('div'); s.body.appendChild(late); ANIMS.forEach(function (x) { x.finish(); }); await settle(p, 1000);
  var before = ANIMS.length, op = s.c.open(); ANIMS.slice(before).forEach(function (x) { x.finish(); }); await settle(op, 1000);
  assert.ok(!a.hasAttribute('inert') && !b.hasAttribute('inert'), 'restored'); assert.ok(pre.hasAttribute('inert'), 'what was inert before stays inert'); assert.ok(!late.hasAttribute('inert'));
  var s2 = setup({ idle: true, reduced: true }); var x = node('div'); s2.body.appendChild(x); var p2 = s2.c.close(); await tick(300); assert.ok(x.hasAttribute('inert')); s2.c.destroy(); assert.ok(!x.hasAttribute('inert'), 'destroy restores');
});
t('normal mode leaves the page alone unless lockPage is true', async function () {
  var s = setup({ idle: true }); var a = node('div'); s.body.appendChild(a); s.c.close(); await tick(300); assert.ok(!a.hasAttribute('inert')); s.c.destroy();
  var s2 = setup({ idle: true, opts: { lockPage: true } }); var b = node('div'); s2.body.appendChild(b); s2.c.close(); await tick(300); assert.ok(b.hasAttribute('inert')); s2.c.destroy(); assert.ok(!b.hasAttribute('inert'));
  var s3 = setup({ idle: true, reduced: true, opts: { lockPage: false } }); var d = node('div'); s3.body.appendChild(d); s3.c.close(); await tick(300); assert.ok(!d.hasAttribute('inert'));
});
t('reducedMotion option forces calm mode on or off', async function () {
  var s = setup({ idle: true, opts: { reducedMotion: true } }); s.c.close(); await tick(300); assert.strictEqual(animsOn(halves(s.c)[0]).length, 0);
  var s2 = setup({ idle: true, reduced: true, opts: { reducedMotion: false } }); s2.c.close(); await tick(300); assert.ok(animsOn(halves(s2.c)[0]).length > 0);
});
t('image-rendering: pixelated only when stepped', async function () {
  var s = setup({ idle: true, opts: { stepped: true } }); await settle(s.c.prepare(), 15000);
  assert.ok(s.c.element.children.every(function (c) { return /image-rendering:pixelated/.test(c.style.cssText); }));
  var s2 = setup({ idle: true }); await settle(s2.c.prepare(), 15000);
  assert.ok(s2.c.element.children.every(function (c) { return !/image-rendering/.test(c.style.cssText); }));
});
t('colors: hex with alpha, rgb with spaces or percentages, names, and junk all give a color', function () {
  var SC = setup({}).SC, fromWhite = function (c) { return SC.mix(c, '#000000', 0); };
  assert.strictEqual(fromWhite('#ff8000'), 'rgb(255,128,0)'); assert.strictEqual(fromWhite('#f80'), 'rgb(255,136,0)');
  assert.strictEqual(fromWhite('#ff800080'), 'rgb(255,128,0)'); assert.strictEqual(fromWhite('#f808'), 'rgb(255,136,0)');
  assert.strictEqual(fromWhite('rgb(10, 20, 30)'), 'rgb(10,20,30)'); assert.strictEqual(fromWhite('rgb(10 20 30 / 50%)'), 'rgb(10,20,30)');
  assert.strictEqual(fromWhite('rgba(100%, 0%, 0%, .4)'), 'rgb(255,0,0)'); assert.strictEqual(fromWhite('red'), 'rgb(255,0,0)');
  assert.strictEqual(fromWhite('not a color'), 'rgb(179,32,42)'); assert.strictEqual(fromWhite(undefined), 'rgb(179,32,42)');
});
t('destroy() during close() resolves it and removes the curtain', async function () {
  var s = setup({ idle: true }); var p = s.c.close(); await tick(300); s.c.destroy(); var r = await settle(p, 1000);
  assert.ok(r.done && !r.threw); assert.strictEqual(s.body.children.length, 0);
});
t('destroy() during open() resolves it', async function () {
  var s = setup({ idle: true }); var p = s.c.close(); await tick(300); ANIMS.forEach(function (a) { a.finish(); }); await settle(p, 1000);
  var op = s.c.open(); s.c.destroy(); var r = await settle(op, 1000); assert.ok(r.done && !r.threw);
});

(async function () {
  for (var i = 0; i < tests.length; i++) {
    try { await tests[i].fn(); pass++; } catch (e) { fail++; console.error('FAIL ' + tests[i].name + ': ' + (e && e.stack || e)); }
  }
  console.log('stage-curtains: ' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
  process.exit(fail ? 1 : 0);
})();
