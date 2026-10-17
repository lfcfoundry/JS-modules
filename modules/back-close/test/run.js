// Node checks for back-close with a fake CloseWatcher, MutationObserver, window and history (no browser).
// Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node modules/back-close/test/run.js   (the Escape-key browser checks stay in run.py)
var assert = require('assert'), path = require('path');
var pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' :: ' + (e && e.message)); }
}

// ---- fakes ----
function FakeCW() { this.dead = false; this.onclose = null; FakeCW.all.push(this); }
FakeCW.all = [];
FakeCW.prototype.destroy = function () { this.dead = true; };
FakeCW.prototype.requestClose = function () { if (!this.dead) { this.dead = true; if (this.onclose) this.onclose(); } };
function live() { return FakeCW.all.filter(function (c) { return !c.dead; }); }
function userClose() { var l = live(); if (l.length) l[l.length - 1].requestClose(); return l.length > 0; }   // Escape or back swipe: newest watcher first

function FakeMO(cb) { this.cb = cb; this.el = null; }
FakeMO.prototype.observe = function (el, opts) { this.el = el; this.opts = opts; el.observers.push(this); };
FakeMO.prototype.disconnect = function () { if (this.el) this.el.observers = this.el.observers.filter(function (o) { return o !== this; }, this); };
function panel(shown) {
  var el = { observers: [], isConnected: true, _hidden: !shown };
  Object.defineProperty(el, 'hidden', { get: function () { return el._hidden; }, set: function (v) { el._hidden = !!v; el.observers.slice().forEach(function (o) { o.cb(); }); } });
  return el;
}

var win, hist;
function newWorld(withCW) {
  FakeCW.all = [];
  global.MutationObserver = FakeMO;
  if (withCW) global.CloseWatcher = FakeCW; else delete global.CloseWatcher;
  hist = { entries: ['start'], index: 0, queue: [], pushes: 0 };
  hist.pushState = function () { hist.entries = hist.entries.slice(0, hist.index + 1); hist.entries.push('e' + (++hist.pushes)); hist.index++; };
  hist.back = function () { if (hist.index > 0) { hist.index--; hist.queue.push(1); } };
  win = { list: {}, history: hist };
  win.addEventListener = function (t, f) { (win.list[t] = win.list[t] || []).push(f); };
  win.removeEventListener = function (t, f) { win.list[t] = (win.list[t] || []).filter(function (x) { return x !== f; }); };
  global.window = win;
}
function flush() { while (hist.queue.length) { hist.queue.shift(); (win.list.popstate || []).slice().forEach(function (f) { f({ type: 'popstate' }); }); } }
function userBack() { hist.back(); flush(); }
function listeners() { return (win.list.popstate || []).length; }

var BackClose = require(path.resolve(__dirname, '../back-close.js'));

// ---- CloseWatcher path ----
check('shown panel arms a watcher; the back request calls close; hiding it disarms', function () {
  newWorld(true); var el = panel(true), hits = 0;
  BackClose.watch(el, function () { hits++; el.hidden = true; });
  assert.strictEqual(live().length, 1); userClose(); assert.strictEqual(hits, 1); assert.strictEqual(live().length, 0);
  el.hidden = false; assert.strictEqual(live().length, 1); el.hidden = true; assert.strictEqual(live().length, 0, 'closing yourself disarms');
});

check('a panel that is not in the page is never armed', function () {
  newWorld(true); var el = panel(true); el.isConnected = false;
  var h = BackClose.watch(el, function () {}); assert.strictEqual(live().length, 0);
  el.hidden = true; el.hidden = false; assert.strictEqual(live().length, 0, 'showing a detached panel does not arm either');
  assert.strictEqual(h.close(), false, 'close() on a detached panel does nothing');
});

check('a panel removed while armed: a refused close does not re-arm a new watcher', function () {
  newWorld(true); var el = panel(true), hits = 0;
  BackClose.watch(el, function () { hits++; });          // the page's close function does not hide it (and the page removed it)
  el.isConnected = false; userClose();
  assert.strictEqual(hits, 1); assert.strictEqual(live().length, 0, 'no trap: the next back request leaves the page');
});

check('a refused close (panel stays open) re-arms while the panel is in the page', function () {
  newWorld(true); var el = panel(true), locked = true, hits = 0;
  BackClose.watch(el, function () { hits++; if (!locked) el.hidden = true; });
  userClose(); assert.strictEqual(live().length, 1, 'armed again'); userClose(); assert.strictEqual(hits, 2);
  locked = false; userClose(); assert.strictEqual(hits, 3); assert.strictEqual(live().length, 0);
});

check('a throwing close function never escapes and still re-arms', function () {
  newWorld(true); var el = panel(true);
  BackClose.watch(el, function () { throw new Error('boom'); }); userClose(); assert.strictEqual(live().length, 1);
});

check('handle.close() goes through the same watcher (cancel step, then your close function)', function () {
  newWorld(true); var el = panel(true), hits = 0;
  var h = BackClose.watch(el, function () { hits++; el.hidden = true; });
  assert.strictEqual(h.close(), true); assert.strictEqual(hits, 1); assert.strictEqual(el.hidden, true); assert.strictEqual(live().length, 0);
  assert.strictEqual(h.close(), false, 'nothing to close now'); assert.strictEqual(hits, 1);
});

check('handle.close() falls back to calling your function if requestClose throws', function () {
  newWorld(true); var el = panel(true), hits = 0;
  var h = BackClose.watch(el, function () { hits++; el.hidden = true; });
  FakeCW.all[0].requestClose = function () { throw new Error('nope'); };
  assert.strictEqual(h.close(), true); assert.strictEqual(hits, 1);
});

check('destroy() during the close function: nothing is armed again', function () {
  newWorld(true); var el = panel(true), h;
  h = BackClose.watch(el, function () { h.destroy(); });   // panel stays open
  userClose(); assert.strictEqual(live().length, 0); assert.strictEqual(el.observers.length, 0);
  assert.strictEqual(h.close(), false);
});

check('destroy() removes the watcher and the observer', function () {
  newWorld(true); var el = panel(true), h = BackClose.watch(el, function () {});
  h.destroy(); assert.strictEqual(live().length, 0); assert.strictEqual(el.observers.length, 0); el.hidden = true; el.hidden = false; assert.strictEqual(live().length, 0); h.destroy();
});

check('two panels: the newest closes first', function () {
  newWorld(true); var a = panel(true), b = panel(true), order = [];
  BackClose.watch(a, function () { order.push('a'); a.hidden = true; }); BackClose.watch(b, function () { order.push('b'); b.hidden = true; });
  userClose(); userClose(); assert.strictEqual(order.join(), 'b,a');
});

check('bad arguments return a harmless handle', function () {
  newWorld(true); var h = BackClose.watch(null, function () {}), g = BackClose.watch(panel(true), null);
  assert.strictEqual(h.supported, false); assert.strictEqual(g.supported, false); h.destroy(); g.destroy(); assert.strictEqual(h.close(), false);
});

// ---- no CloseWatcher ----
check('without CloseWatcher and without the option, nothing happens', function () {
  newWorld(false); var el = panel(true), h = BackClose.watch(el, function () {});
  assert.strictEqual(h.supported, false); assert.strictEqual(h.mode, 'none'); assert.strictEqual(hist.pushes, 0); assert.strictEqual(listeners(), 0); assert.strictEqual(BackClose.supported, false);
});

check('without CloseWatcher, handle.close() calls your function only while the panel is shown', function () {
  newWorld(false); var el = panel(true), hits = 0, h = BackClose.watch(el, function () { hits++; el.hidden = true; });
  assert.strictEqual(h.close(), true); assert.strictEqual(hits, 1); assert.strictEqual(h.close(), false); assert.strictEqual(hits, 1);
});

check('with CloseWatcher present the history option is not used', function () {
  newWorld(true); var el = panel(true), h = BackClose.watch(el, function () {}, { historyFallback: true });
  assert.strictEqual(h.mode, 'closewatcher'); assert.strictEqual(hist.pushes, 0); assert.strictEqual(BackClose.supported, true);
});

// ---- history fallback ----
check('fallback: showing the panel pushes one entry; the back button closes it', function () {
  newWorld(false); var el = panel(false), hits = 0;
  var h = BackClose.watch(el, function () { hits++; el.hidden = true; }, { historyFallback: true });
  assert.strictEqual(h.supported, true); assert.strictEqual(h.mode, 'history'); assert.strictEqual(hist.pushes, 0, 'nothing pushed while hidden');
  el.hidden = false; assert.strictEqual(hist.pushes, 1); assert.strictEqual(hist.index, 1);
  userBack(); assert.strictEqual(hits, 1); assert.strictEqual(el.hidden, true); assert.strictEqual(hist.index, 0, 'we are back on the page entry');
  assert.strictEqual(hist.pushes, 1, 'no extra entry was pushed'); assert.strictEqual(listeners(), 0, 'popstate listener removed when idle');
});

check('fallback: closing with your own button removes the extra entry again', function () {
  newWorld(false); var el = panel(false), hits = 0;
  BackClose.watch(el, function () { hits++; el.hidden = true; }, { historyFallback: true });
  el.hidden = false; assert.strictEqual(hist.index, 1); el.hidden = true; flush();
  assert.strictEqual(hist.index, 0, 'history is back where it started'); assert.strictEqual(hits, 0, 'the undo is not treated as a back press'); assert.strictEqual(listeners(), 0);
  el.hidden = false; assert.strictEqual(hist.index, 1); userBack(); assert.strictEqual(hits, 1, 'still works after an undo');
});

check('fallback: a refused close pushes a new entry and keeps the panel closable', function () {
  newWorld(false); var el = panel(true), locked = true, hits = 0;
  BackClose.watch(el, function () { hits++; if (!locked) el.hidden = true; }, { historyFallback: true });
  assert.strictEqual(hist.index, 1); userBack(); assert.strictEqual(hits, 1); assert.strictEqual(hist.index, 1, 'a fresh entry stands again');
  locked = false; userBack(); assert.strictEqual(hits, 2); assert.strictEqual(el.hidden, true); assert.strictEqual(hist.index, 0);
});

check('fallback: two panels close newest first, one back press each', function () {
  newWorld(false); var a = panel(false), b = panel(false), order = [];
  BackClose.watch(a, function () { order.push('a'); a.hidden = true; }, { historyFallback: true });
  BackClose.watch(b, function () { order.push('b'); b.hidden = true; }, { historyFallback: true });
  a.hidden = false; b.hidden = false; assert.strictEqual(hist.index, 2);
  userBack(); assert.strictEqual(order.join(), 'b'); assert.strictEqual(a.hidden, false); userBack(); assert.strictEqual(order.join(), 'b,a'); assert.strictEqual(hist.index, 0);
});

check('fallback: the lower panel closed by its own button is stepped over later', function () {
  newWorld(false); var a = panel(false), b = panel(false), order = [];
  BackClose.watch(a, function () { order.push('a'); a.hidden = true; }, { historyFallback: true });
  BackClose.watch(b, function () { order.push('b'); b.hidden = true; }, { historyFallback: true });
  a.hidden = false; b.hidden = false; a.hidden = true; flush();      // a closed by its X while b is on top: its entry stays buried
  assert.strictEqual(hist.index, 2);
  userBack(); flush(); assert.strictEqual(order.join(), 'b'); assert.strictEqual(hist.index, 0, 'the buried entry was stepped over, no dead back press');
  assert.strictEqual(listeners(), 0);
});

check('fallback: handle.close() takes the same route as the back button', function () {
  newWorld(false); var el = panel(true), hits = 0;
  var h = BackClose.watch(el, function () { hits++; el.hidden = true; }, { historyFallback: true });
  assert.strictEqual(h.close(), true); flush(); assert.strictEqual(hits, 1); assert.strictEqual(hist.index, 0); assert.strictEqual(h.close(), false);
});

check('fallback: destroy() removes our entry and the listener; a detached panel is never armed', function () {
  newWorld(false); var el = panel(true), h = BackClose.watch(el, function () {}, { historyFallback: true });
  assert.strictEqual(hist.index, 1); h.destroy(); flush(); assert.strictEqual(hist.index, 0); assert.strictEqual(listeners(), 0);
  var d = panel(true); d.isConnected = false; BackClose.watch(d, function () {}, { historyFallback: true }); assert.strictEqual(hist.pushes, 1, 'no entry for a detached panel');
});

check('fallback: destroy() during the close function does not push again', function () {
  newWorld(false); var el = panel(true), h;
  h = BackClose.watch(el, function () { h.destroy(); }, { historyFallback: true });
  userBack(); flush(); assert.strictEqual(hist.index, 0); assert.strictEqual(hist.pushes, 1);
});

check('fallback: a throwing pushState is survived', function () {
  newWorld(false); hist.pushState = function () { throw new Error('SecurityError'); };
  var el = panel(true), h = BackClose.watch(el, function () {}, { historyFallback: true }); h.destroy();
});

// ---- panels that are not toggled with `hidden`, and panels that are not an element ----
function classPanel(open) {   // a panel opened with a class: `open` changes notify the observers the way an attribute change would
  var el = { observers: [], isConnected: true, _open: !!open, hidden: false };
  Object.defineProperty(el, 'open', { get: function () { return el._open; }, set: function (v) { el._open = !!v; el.observers.slice().forEach(function (o) { o.cb(); }); } });
  return el;
}

check('isShown + attributes: a class-toggled panel arms when it opens and disarms when it closes; the observer watches only `class`', function () {
  newWorld(true); var el = classPanel(false), hits = 0;
  BackClose.watch(el, function () { hits++; el.open = false; }, { isShown: function (e) { return e.open; }, attributes: ['class'] });
  assert.deepStrictEqual(el.observers[0].opts, { attributes: true, attributeFilter: ['class'] });
  assert.strictEqual(live().length, 0, 'closed: nothing armed');
  el.open = true; assert.strictEqual(live().length, 1);
  userClose(); assert.strictEqual(hits, 1); assert.strictEqual(live().length, 0);
  el.open = true; el.open = false; assert.strictEqual(live().length, 0, 'closing yourself disarms');
});

check('isShown: a detached panel is never armed, and a throwing isShown counts as closed', function () {
  newWorld(true); var el = classPanel(true); el.isConnected = false;
  BackClose.watch(el, function () {}, { isShown: function (e) { return e.open; } }); assert.strictEqual(live().length, 0);
  var bad = classPanel(true); BackClose.watch(bad, function () {}, { isShown: function () { throw new Error('page bug'); } }); assert.strictEqual(live().length, 0);
});

check('default is unchanged: the observer watches `hidden` only', function () {
  newWorld(true); var el = panel(true); BackClose.watch(el, function () {});
  assert.deepStrictEqual(el.observers[0].opts, { attributes: true, attributeFilter: ['hidden'] });
});

check('watchWhen: no element and no MutationObserver needed; sync() arms and disarms; the back request closes everything', function () {
  newWorld(true); delete global.MutationObserver;
  var openN = 0, closed = 0, h = BackClose.watchWhen(function () { return openN > 0; }, function () { closed++; openN = 0; h.sync(); });
  assert.strictEqual(h.supported, true); assert.strictEqual(h.mode, 'closewatcher'); assert.strictEqual(live().length, 0);
  openN = 2; h.sync(); assert.strictEqual(live().length, 1); h.sync(); assert.strictEqual(live().length, 1, 'syncing again does not stack watchers');
  userClose(); assert.strictEqual(closed, 1); assert.strictEqual(live().length, 0);
  openN = 1; h.sync(); assert.strictEqual(live().length, 1); openN = 0; h.sync(); assert.strictEqual(live().length, 0, 'everything closed another way');
});

check('watchWhen: the close function leaving a panel open arms again; handle.close() uses the same route; destroy() removes it', function () {
  newWorld(true); var openN = 1, tries = 0, h = BackClose.watchWhen(function () { return openN > 0; }, function () { tries++; });
  assert.strictEqual(live().length, 1); userClose(); assert.strictEqual(tries, 1); assert.strictEqual(live().length, 1, 'still open, so armed again');
  assert.strictEqual(h.close(), true); assert.strictEqual(tries, 2);
  h.destroy(); assert.strictEqual(live().length, 0); h.sync(); assert.strictEqual(live().length, 0, 'sync() after destroy() does nothing'); assert.strictEqual(h.close(), false);
});

check('watchWhen: without CloseWatcher it is unsupported but close() still runs your function while open; with the history option it uses history', function () {
  newWorld(false); var openN = 1, hits = 0, h = BackClose.watchWhen(function () { return openN > 0; }, function () { hits++; openN = 0; h.sync(); });
  assert.strictEqual(h.supported, false); assert.strictEqual(h.close(), true); assert.strictEqual(hits, 1); assert.strictEqual(h.close(), false);
  newWorld(false); var open2 = 1, hits2 = 0, h2 = BackClose.watchWhen(function () { return open2 > 0; }, function () { hits2++; open2 = 0; h2.sync(); }, { historyFallback: true });
  assert.strictEqual(h2.mode, 'history'); assert.strictEqual(hist.index, 1); userBack(); assert.strictEqual(hits2, 1); assert.strictEqual(hist.index, 0);
});

check('watchWhen: bad arguments give an unsupported handle that never throws', function () {
  newWorld(true); var h = BackClose.watchWhen(null, function () {}); assert.strictEqual(h.supported, false); assert.strictEqual(h.close(), false); h.sync(); h.destroy();
  var h2 = BackClose.watchWhen(function () { return true; }); assert.strictEqual(h2.supported, false);
});

console.log('\nback-close (node): ' + (pass + fail) + ' checks, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
