// Node checks for wake-keeper with a fake navigator, document and clock. Copyright (c) 2026 JNFoo. MIT License.
var WakeKeeper = require('../wake-keeper.js'), pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' ' + extra : '')); } }
function tick() { return new Promise(function (r) { setImmediate(r); }); }
function world(opts) {
  opts = opts || {};
  var w = { state: 'visible', listeners: {}, timers: [], now: 0, requests: 0, sentinels: [], reject: false };
  w.doc = { get visibilityState() { return w.state; }, addEventListener: function (t, f) { w.listeners[t] = f; }, removeEventListener: function (t) { delete w.listeners[t]; } };
  w.nav = opts.none ? {} : { wakeLock: { request: function () { w.requests++; if (w.reject) return Promise.reject(new Error('NotAllowedError')); var s = { released: false, ev: {}, addEventListener: function (t, f) { s.ev[t] = f; }, release: function () { s.released = true; return Promise.resolve(); } }; w.sentinels.push(s); return Promise.resolve(s); } } };
  w.setTimeout = function (f, ms) { var t = { f: f, at: w.now + ms, id: w.timers.length }; w.timers.push(t); return t; };
  w.clearTimeout = function (t) { if (t) t.dead = true; };
  w.advance = function (ms) { w.now += ms; w.timers.forEach(function (t) { if (!t.dead && !t.done && t.at <= w.now) { t.done = true; t.f(); } }); };
  w.hide = function () { w.state = 'hidden'; w.sentinels.forEach(function (s) { if (!s.released) { s.released = true; if (s.ev.release) s.ev.release(); } }); w.listeners.visibilitychange && w.listeners.visibilitychange(); };   // the browser drops the lock itself
  w.show = function () { w.state = 'visible'; w.listeners.visibilitychange && w.listeners.visibilitychange(); };
  w.keeper = function (o) { o = o || {}; return WakeKeeper.create({ nav: w.nav, doc: w.doc, setTimeout: w.setTimeout, clearTimeout: w.clearTimeout, idleMs: o.idleMs || 60000, onRefused: o.onRefused, onChange: o.onChange }); };
  return w;
}
(async function () {
  var w = world(), k = w.keeper();
  check('supported when navigator.wakeLock exists', k.supported === true);
  check('nothing is requested before want()', w.requests === 0 && !k.held);
  k.want(true); await tick(); check('want(true) requests one lock', w.requests === 1 && k.held);
  k.want(true); k.poke(); await tick(); check('asking again while held does not request a second lock', w.requests === 1);
  k.want(false); await tick(); check('want(false) releases the lock', !k.held && w.sentinels[0].released);
  k.want(true); await tick(); check('a new lock is requested after a release, never the old one reused', w.requests === 2 && w.sentinels[1] !== w.sentinels[0] && k.held);

  w.hide(); await tick(); check('hidden tab: lock is gone and none is requested', !k.held && w.requests === 2);
  w.show(); await tick(); check('visible again: asked for again because play is still wanted', k.held && w.requests === 3);

  w.advance(59000); await tick(); check('held just before the idle limit', k.held);
  w.advance(2000); await tick(); check('released after 60 s without input', !k.held && k.idle);
  k.poke(); await tick(); check('a tap after an idle release asks again', k.held && !k.idle && w.requests === 4);
  w.advance(30000); k.poke(); w.advance(40000); await tick(); check('a poke restarts the idle timer (70 s in total, still held)', k.held);

  k.want(false); w.requests = 0;
  var rw = world(); var seen = []; var rk = rw.keeper({ onRefused: function (e) { seen.push(e.message); } }); rw.reject = true;
  rk.want(true); await tick(); check('a refusal calls onRefused once and does not loop', seen.length === 1 && rw.requests === 1 && !rk.held && rk.refusals === 1);
  await tick(); await tick(); check('no retry storm after a refusal', rw.requests === 1);
  rw.reject = false; rk.poke(); await tick(); check('the next poke tries again and works', rk.held && rw.requests === 2);

  var nw = world({ none: true }), nk = nw.keeper(); nk.want(true); nk.poke(); check('no wakeLock: supported false and nothing throws', nk.supported === false && !nk.held);

  var sw = world(), sk = sw.keeper(); sk.want(true); sk.want(false); await tick(); check('want(true) then want(false) at once ends with no lock held', !sk.held && sw.sentinels.every(function (s) { return s.released; }));
  var hw = world(), hk = hw.keeper(); hk.want(true); hw.hide(); await tick(); check('hidden before the request resolves: the late lock is released at once', !hk.held && hw.sentinels.every(function (s) { return s.released; }));

  var cw = world(), changes = [], ck = cw.keeper({ onChange: function (h) { changes.push(h); } }); ck.want(true); await tick(); ck.want(false); await tick(); check('onChange reports acquire then release', changes.join() === 'true,false');
  var dw = world(), dk = dw.keeper(); dk.want(true); await tick(); dk.destroy(); check('destroy releases and removes the listener', !dk.held && !dw.listeners.visibilitychange);
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
