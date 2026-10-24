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


// ---- 1.1.0: waiting close() paints a little each frame, a turned window is painted again, a cancelled zoom ends the open ----
async function ticksUntilMoving(o) {
  var s = setup({ idle: true, opts: o }); var p = s.c.close(), n = 0;
  while (!ANIMS.length && n < 400) { await tick(16); n++; }
  ANIMS.forEach(function (a) { a.finish(); }); var r = await settle(p, 3000); assert.ok(r.done && !r.threw);
  assert.strictEqual(s.c.isClosed, true); return n;
}
t('close() with nothing painted yet paints a little each frame (warmMs); warmMs: 0 paints it all at once', async function () {
  var big = { width: 800, height: 1000, wasm: false };   // the JavaScript loop: slow enough here to show the slicing (the WebAssembly loop is several times faster)
  var warm = await ticksUntilMoving(big), fast = await ticksUntilMoving({ width: 800, height: 1000, warmMs: 0, wasm: false });
  assert.ok(warm > fast + 2, 'warm took ' + warm + ' frames, all-at-once took ' + fast);
});
t('close() with nothing painted yet and the WebAssembly loop: warmMs slices it too, and it is ready no later than the JavaScript loop', async function () {
  var js = await ticksUntilMoving({ width: 800, height: 1000, wasm: false }), wa = await ticksUntilMoving({ width: 800, height: 1000 });
  assert.ok(wa <= js, 'wasm took ' + wa + ' frames, JavaScript ' + js);
});
t('warmMs: a very short wait still ends with the curtain closed (the rest is painted at once)', async function () {
  var n = await ticksUntilMoving({ width: 800, height: 1000, warmMs: 1 }); assert.ok(n < 400);
});
t('a window turned between prepare() and close() gets velvet painted for the new size', async function () {
  var s = setup({ idle: true, opts: { width: 0, height: 0 } }); s.body.clientWidth = 60; s.body.clientHeight = 40;
  var r0 = await settle(s.c.prepare(), 15000); assert.ok(r0.done); assert.strictEqual(s.c.isReady, true);
  s.body.clientWidth = 90; s.body.clientHeight = 40;
  var p = s.c.close(); await tick(600); ANIMS.forEach(function (a) { a.finish(); }); var r = await settle(p, 3000); assert.ok(r.done && !r.threw);
  assert.strictEqual(halves(s.c)[0].style.cssText.indexOf('width:51px') >= 0, true, 'half is ' + halves(s.c)[0].style.cssText);   // ceil(90 / 2) + 6
});
t('an unchanged size keeps the velvet that was painted ahead (no repaint)', async function () {
  var s = setup({ idle: true, opts: { width: 0, height: 0 } }); s.body.clientWidth = 60; s.body.clientHeight = 40;
  await settle(s.c.prepare(), 15000); var el = s.c.element;
  var p = s.c.close(); await tick(300); assert.strictEqual(s.c.element, el, 'the curtain painted ahead was thrown away'); ANIMS.forEach(function (a) { a.finish(); }); await settle(p, 1000);
});
t('open(): a zoom that is cancelled by the browser ends the open at once, not after the timer', async function () {
  var s = setup({ idle: true }); var p = s.c.close(); await tick(300); ANIMS.forEach(function (a) { a.finish(); }); await settle(p, 1000);
  var before = ANIMS.length, el = s.c.element, op = s.c.open(), done = false; op.then(function () { done = true; });
  var last = ANIMS.slice(before).filter(function (a) { return typeof a.oncancel === 'function'; })[0]; assert.ok(last, 'the zoom has no cancel handler');
  last.oncancel(); await tick(48); assert.strictEqual(done, true, 'open() waited for the timer'); assert.strictEqual(s.body.children.indexOf(el), -1);
});

// ---- the WebAssembly velvet loop: the very same bytes as the JavaScript loop, one instance shared, and the JavaScript loop when WebAssembly cannot be used ----
function capturingDocument() {   // a canvas whose ImageData we can read back after step() finishes
  return { createElement: function () { var cv = { width: 0, height: 0, getContext: function () { return { createImageData: function (w, h) { cv.img = { data: new Uint8ClampedArray(w * h * 4) }; return cv.img; }, putImageData: function () { cv.put = true; } }; } }; return cv; } };
}
function paintBytes(SC, args, ms) {   // paints the whole velvet (step(0) at once, or slices of ms until done) and returns { bytes, engine, slices }
  var j = SC.velvetPainter.apply(null, args), n = 0;
  if (ms) while (!j.step(ms)) n++; else j.step(0);
  return { bytes: j.canvas.img.data, engine: j.engine, slices: n, put: j.canvas.put, job: j };
}
function sameBytes(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
// the picture gate: the SIMD kernel works in single precision, so against the JavaScript loop 99.5% of the pixels must be within 5 counts on every channel (measured: 99.986% or better); stepped curtains take the exact scalar path and stay byte for byte
function nearBytes(a, b) { if (a.length !== b.length) return false; var ok = 0, n = a.length >> 2; for (var i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) <= 5 && Math.abs(a[i + 1] - b[i + 1]) <= 5 && Math.abs(a[i + 2] - b[i + 2]) <= 5 && a[i + 3] === b[i + 3]) ok++; return ok >= 0.995 * n; }
function freshSC() { delete require.cache[require.resolve('../stage-curtains.js')]; return require('../stage-curtains.js'); }
t('wasm: the default is WebAssembly, wasm: false is JavaScript, and wasmAvailable() says so', function () {
  global.document = capturingDocument(); var SC = freshSC();
  assert.strictEqual(SC.wasmAvailable(), true);
  assert.strictEqual(paintBytes(SC, [212, 892, 1.25, '#b3202a', 11, false]).engine, 'wasm');
  assert.strictEqual(paintBytes(SC, [212, 892, 1.25, '#b3202a', 11, false, false]).engine, 'js');
});
t('wasm: 112 curtains (8 colors x 7 sizes x stepped on and off) are within the picture gate of the JavaScript curtain (smooth) or byte for byte it (stepped)', function () {
  global.document = capturingDocument(); var SC = freshSC();
  var bases = ['#b3202a', '#e2301f', '#ffd23a', '#8a1010', '#7a5cf0', '#d8d8f0', '#2f7a3a', '#ff8a2a'];
  var geoms = [[212, 892, 1.25], [212, 892, 1], [500, 900, 1], [966, 1000, 1], [100, 300, 1 / 3], [320, 700, 2], [7, 20, 1]], n = 0, bad = [];
  bases.forEach(function (b, bi) { geoms.forEach(function (g, gi) { [false, true].forEach(function (st) {
    var seed = 11 + bi * 23 + gi * 17, a = paintBytes(SC, [g[0], g[1], g[2], b, seed, st, false]), c = paintBytes(SC, [g[0], g[1], g[2], b, seed, st]);
    n++; if (a.engine !== 'js' || c.engine !== 'wasm' || !(st ? sameBytes : nearBytes)(a.bytes, c.bytes) || !c.put) bad.push(b + ' ' + g + ' ' + st);
  }); }); });
  assert.strictEqual(n, 112); assert.deepStrictEqual(bad, [], 'differing curtains: ' + bad.slice(0, 3));
});
t('wasm: 300 random curtains (any color string, size, scale, seed, stepped) are within the picture gate of the JavaScript curtain (stepped ones byte for byte)', function () {
  global.document = capturingDocument(); var SC = freshSC(), seed = 20261018, bad = [];
  function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  var named = ['#fff', 'rgb(200, 30, 60)', 'rgba(10,200,40,0.5)', 'rgb(100%, 20%, 0%)', '#ff000080', '#10101f'];
  for (var q = 0; q < 300; q++) {
    var col = rnd() < 0.5 ? '#' + ('00000' + Math.floor(rnd() * 16777216).toString(16)).slice(-6) : named[Math.floor(rnd() * named.length)];
    var args = [20 + Math.floor(rnd() * 300), 30 + Math.floor(rnd() * 400), [1, 1.25, 1 / 3, 2, 1.5][Math.floor(rnd() * 5)], col, 1 + Math.floor(rnd() * 100000), rnd() < 0.5];
    var a = paintBytes(SC, args.concat([false])), c = paintBytes(SC, args);
    if (!(args[5] ? sameBytes : nearBytes)(a.bytes, c.bytes) || c.engine !== 'wasm') bad.push(args.join(','));
  }
  assert.deepStrictEqual(bad, [], 'differing: ' + bad.slice(0, 3));
});
t('wasm: painting in slices gives the same bytes, step(ms) keeps returning false until the last row, and the image is put once', function () {
  global.document = capturingDocument(); var SC = freshSC();
  var ref = paintBytes(SC, [300, 600, 1.25, '#b3202a', 5, false, false]), got = paintBytes(SC, [300, 600, 1.25, '#b3202a', 5, false], 0.0001);
  assert.ok(got.slices > 20, 'one slice painted everything: ' + got.slices); assert.ok(nearBytes(ref.bytes, got.bytes)); assert.strictEqual(got.engine, 'wasm'); assert.strictEqual(got.put, true);
  assert.strictEqual(got.job.step(0), true, 'a finished painter stays finished');
});
t('wasm: two painters of different sizes painted by turns (tables re-sent, memory grown) are both right', function () {
  global.document = capturingDocument(); var SC = freshSC();
  var A = SC.velvetPainter(200, 400, 1, '#7a5cf0', 3, false), B = SC.velvetPainter(900, 700, 1.25, '#ffd23a', 4, true), C = SC.velvetPainter(60, 90, 1, '#2f7a3a', 6, false);
  var rA = paintBytes(SC, [200, 400, 1, '#7a5cf0', 3, false, false]).bytes, rB = paintBytes(SC, [900, 700, 1.25, '#ffd23a', 4, true, false]).bytes, rC = paintBytes(SC, [60, 90, 1, '#2f7a3a', 6, false, false]).bytes;
  var i = 0; while (!(A.done && B.done && C.done)) { [A, B, C].forEach(function (j) { if (!j.done) j.step(0.0001); }); if (++i > 100000) assert.fail('never finished'); }
  assert.ok(nearBytes(A.canvas.img.data, rA) && sameBytes(B.canvas.img.data, rB) && nearBytes(C.canvas.img.data, rC));
  assert.ok(A.engine === 'wasm' && B.engine === 'wasm' && C.engine === 'wasm');
});
t('wasm: no WebAssembly at all gives the JavaScript curtain, same bytes', function () {
  var saved = global.WebAssembly; global.document = capturingDocument(); var SC, a, c;
  try { global.WebAssembly = undefined; SC = freshSC(); assert.strictEqual(SC.wasmAvailable(), false); a = paintBytes(SC, [212, 892, 1.25, '#b3202a', 11, false]); }
  finally { global.WebAssembly = saved; }
  c = paintBytes(freshSC(), [212, 892, 1.25, '#b3202a', 11, false, false]);
  assert.strictEqual(a.engine, 'js'); assert.ok(sameBytes(a.bytes, c.bytes));
});
t('wasm: a page policy that refuses the module (Module throws) gives the JavaScript curtain, same bytes', function () {
  var Mod = WebAssembly.Module; global.document = capturingDocument(); var a;
  try { WebAssembly.Module = function () { throw new Error('refused by the page policy'); }; var SC = freshSC(); assert.strictEqual(SC.wasmAvailable(), false); a = paintBytes(SC, [212, 892, 1.25, '#b3202a', 11, false]); }
  finally { WebAssembly.Module = Mod; }
  assert.strictEqual(a.engine, 'js'); assert.ok(sameBytes(a.bytes, paintBytes(freshSC(), [212, 892, 1.25, '#b3202a', 11, false, false]).bytes));
});
t('wasm: if the kernel memory cannot grow mid-paint the JavaScript loop finishes the curtain, same bytes', function () {
  global.document = capturingDocument(); var SC = freshSC(), grow = WebAssembly.Memory.prototype.grow, a;
  try { WebAssembly.Memory.prototype.grow = function () { throw new RangeError('out of memory'); }; a = paintBytes(SC, [3000, 200, 1, '#b3202a', 2, false]); }
  finally { WebAssembly.Memory.prototype.grow = grow; }
  assert.strictEqual(a.engine, 'js'); assert.ok(sameBytes(a.bytes, paintBytes(SC, [3000, 200, 1, '#b3202a', 2, false, false]).bytes));
});
t('wasm: create({ wasm: false }) paints both halves with JavaScript', async function () {
  var s = setup({ idle: true, opts: { wasm: false } }); var seen = [];
  var vp = s.SC.velvetPainter; assert.strictEqual(typeof vp, 'function');
  var r = await settle(s.c.prepare(), 15000); assert.ok(r.done && !r.threw); assert.strictEqual(s.c.isReady, true);
});
t('wasm: velvet.wasm in stage-curtains.js is the file wasm/velvet.wasm, and (with clang) it is what wasm/velvet.c builds', function () {
  var cp = require('child_process'), path = require('path'), dir = path.join(__dirname, '..');
  var emb = cp.spawnSync('python3', [path.join(dir, 'wasm', 'embed.py'), '--check'], { encoding: 'utf8' });
  assert.strictEqual(emb.status, 0, emb.stdout + emb.stderr);
  if (cp.spawnSync('clang', ['--version']).status === 0) { var b = cp.spawnSync('sh', [path.join(dir, 'wasm', 'build.sh'), '--check'], { encoding: 'utf8' }); assert.strictEqual(b.status, 0, b.stdout + b.stderr); }
  else console.log('  skip clang not found: not checking the rebuild');
});

/* ---- the background worker (option worker: true), with a pretend Worker that runs the worker's own source text in this process ---- */
function pretendWorkers(how) {   // how: 'ok', 'throws' (constructor throws), 'posts-error', 'onerror', 'none' (no Worker at all)
  var saved = { Worker: global.Worker, Blob: global.Blob, URL: global.URL }, log = { made: 0, terminated: 0, revoked: 0, posted: 0 };
  if (how !== 'none') {
    global.Blob = function (parts) { this.text = parts.join(''); };
    global.URL = function () {}; global.URL.createObjectURL = function (b) { return { text: b.text }; }; global.URL.revokeObjectURL = function () { log.revoked++; };
    global.Worker = function (url) {
      var w = this, handler; log.made++;
      if (how === 'throws') throw new Error('refused by the page policy');
      if (how !== 'posts-error') { var scope = new Function('postMessage', 'var onmessage;\n' + url.text + '\nreturn function (e) { return onmessage(e); };'); handler = scope(function (m) { setImmediate(function () { w.onmessage({ data: m }); }); }); }
      w.postMessage = function (m) {
        log.posted++;
        setImmediate(function () {
          if (how === 'onerror') return w.onerror({ preventDefault: function () {} });
          if (how === 'posts-error') return w.onmessage({ data: { id: m.id, error: 'boom' } });
          handler({ data: JSON.parse(JSON.stringify(m)) });
        });
      };
      w.terminate = function () { log.terminated++; };
    };
  } else { delete global.Worker; }
  return { log: log, restore: function () { global.Worker = saved.Worker; global.Blob = saved.Blob; global.URL = saved.URL; if (saved.Worker === undefined) delete global.Worker; } };
}
async function paintWorker(SC, args) {   // steps until done (the page keeps getting its turn between steps)
  var j = SC.velvetPainter.apply(null, args), n = 0;
  while (!j.step(8) && n++ < 2000) await new Promise(function (r) { setImmediate(r); });
  return { bytes: j.canvas.img.data, engine: j.engine, done: j.done, steps: n, put: j.canvas.put };
}
t('worker: both halves, stepped and smooth, three colors paint the same pixels in the worker as on the page, with wasm and with JavaScript', async function () {
  global.document = capturingDocument(); var pw = pretendWorkers('ok'), SC = freshSC(), tried = 0;
  try {
    for (var c of ['#b3202a', '#1e5aa8', '#e0b020']) for (var st of [false, true]) for (var seed of [5, 28]) for (var wasm of [undefined, false]) {
      var a = paintBytes(SC, [212, 892, 1.25, c, seed, st, wasm]), b = await paintWorker(SC, [212, 892, 1.25, c, seed, st, wasm, true]);
      assert.ok(b.done && b.put !== undefined || b.done, 'finished'); assert.ok(sameBytes(a.bytes, b.bytes), c + ' ' + st + ' ' + seed + ' ' + wasm);
      assert.strictEqual(b.engine, wasm === false ? 'worker+js' : 'worker+wasm'); tried++;
    }
    assert.strictEqual(pw.log.made, 1, 'one worker serves every half');
  } finally { pw.restore(); }
  assert.strictEqual(tried, 24);
});
t('worker: step() returns false until the pixels arrive, then puts them on the canvas once and returns true', async function () {
  global.document = capturingDocument(); var pw = pretendWorkers('ok'), SC = freshSC();
  try {
    var j = SC.velvetPainter(97, 53, 2, '#b3202a', 3, false, undefined, true), first = j.step(8);
    assert.strictEqual(first, false); assert.strictEqual(j.done, false); assert.strictEqual(j.canvas.put, undefined, 'nothing drawn yet');
    for (var n = 0; !j.step(8) && n < 500; n++) await new Promise(function (r) { setImmediate(r); });
    assert.strictEqual(j.done, true); assert.ok(j.canvas.put !== undefined, 'drawn'); assert.strictEqual(j.step(8), true);
  } finally { pw.restore(); }
});
['throws', 'posts-error', 'onerror', 'none'].forEach(function (how) {
  t('worker: ' + how + ' falls back to the page, silently, with the same pixels, and the worker is not tried again', async function () {
    global.document = capturingDocument(); var pw = pretendWorkers(how), SC = freshSC(), ref = paintBytes(SC, [212, 892, 1.25, '#b3202a', 11, false]);
    try {
      var b = await paintWorker(SC, [212, 892, 1.25, '#b3202a', 11, false, undefined, true]);
      assert.ok(b.done); assert.ok(sameBytes(ref.bytes, b.bytes)); assert.strictEqual(b.engine, 'wasm');
      var made = pw.log.made, b2 = await paintWorker(SC, [212, 892, 1.25, '#b3202a', 11, false, undefined, true]);
      assert.ok(sameBytes(ref.bytes, b2.bytes)); assert.strictEqual(pw.log.made, made, 'not tried again');
    } finally { pw.restore(); }
  });
});
t('worker: release() ends the worker and a later painter makes a new one; startWorker() makes it early', async function () {
  global.document = capturingDocument(); var pw = pretendWorkers('ok'), SC = freshSC();
  try {
    assert.strictEqual(SC.startWorker(), true); assert.strictEqual(pw.log.made, 1);
    await paintWorker(SC, [97, 53, 2, '#b3202a', 3, false, undefined, true]); assert.strictEqual(pw.log.made, 1);
    SC.release(); assert.strictEqual(pw.log.terminated, 1); assert.strictEqual(pw.log.revoked, 1);
    await paintWorker(SC, [97, 53, 2, '#b3202a', 3, false, undefined, true]); assert.strictEqual(pw.log.made, 2);
    SC.release();
  } finally { pw.restore(); }
});
t('worker: create({ worker: true }) paints both halves in the worker and the curtain still closes and opens', async function () {
  var pw = pretendWorkers('ok'), s = setup({ idle: true, opts: { worker: true } });
  try { var r = await settle(s.c.prepare(), 15000); assert.ok(r.done && !r.threw, 'prepare finished'); } finally { pw.restore(); }
  assert.ok(pw.log.posted >= 2, 'two halves posted: ' + pw.log.posted);
});
t('worker: the default (no worker option) never touches Worker', async function () {
  global.document = capturingDocument(); var pw = pretendWorkers('ok'), SC = freshSC();
  try { paintBytes(SC, [97, 53, 2, '#b3202a', 3, false]); assert.strictEqual(pw.log.made, 0); } finally { pw.restore(); }
});

(async function () {
  for (var i = 0; i < tests.length; i++) {
    try { await tests[i].fn(); pass++; } catch (e) { fail++; console.error('FAIL ' + tests[i].name + ': ' + (e && e.stack || e)); }
  }
  console.log('stage-curtains: ' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
  process.exit(fail ? 1 : 0);
})();
