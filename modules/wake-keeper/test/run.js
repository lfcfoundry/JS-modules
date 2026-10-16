// Node checks for wake-keeper with a fake navigator, document and clock. Copyright (c) 2026 LFC Foundry. MIT License.
var WakeKeeper = require('../wake-keeper.js'), pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' ' + extra : '')); } }
function tick() { return new Promise(function (r) { setImmediate(r); }); }
function world(opts) {
  opts = opts || {};
  var w = { state: 'visible', listeners: {}, timers: [], now: 0, requests: 0, sentinels: [], reject: false };
  w.doc = { get visibilityState() { return w.state; }, addEventListener: function (t, f) { w.listeners[t] = f; }, removeEventListener: function (t) { delete w.listeners[t]; } };
  w.waiting = [];   // when w.defer is true, answers are held until the test calls w.answer(i, 'ok' or 'fail')
  w.nav = opts.none ? {} : { wakeLock: { request: function () { w.requests++; if (w.defer) return new Promise(function (res, rej) { w.waiting.push({ res: res, rej: rej }); }); if (w.reject) return Promise.reject(new Error('NotAllowedError')); var s = { released: false, ev: {}, addEventListener: function (t, f) { s.ev[t] = f; }, release: function () { s.released = true; return Promise.resolve(); } }; w.sentinels.push(s); return Promise.resolve(s); } } };
  w.answer = function (i, how) { var q = w.waiting[i]; if (how === 'fail') q.rej(new Error('NotAllowedError')); else { var s = { released: false, ev: {}, addEventListener: function (t, f) { s.ev[t] = f; }, release: function () { s.released = true; return Promise.resolve(); } }; w.sentinels.push(s); q.res(s); } };
  w.setTimeout = function (f, ms) { var t = { f: f, at: w.now + ms, id: w.timers.length }; w.timers.push(t); return t; };
  w.clearTimeout = function (t) { if (t) t.dead = true; };
  w.advance = function (ms) { w.now += ms; w.timers.forEach(function (t) { if (!t.dead && !t.done && t.at <= w.now) { t.done = true; t.f(); } }); };
  w.hide = function () { w.state = 'hidden'; w.sentinels.forEach(function (s) { if (!s.released) { s.released = true; if (s.ev.release) s.ev.release(); } }); w.listeners.visibilitychange && w.listeners.visibilitychange(); };   // the browser drops the lock itself
  w.show = function () { w.state = 'visible'; w.listeners.visibilitychange && w.listeners.visibilitychange(); };
  w.keeper = function (o) { o = o || {}; return WakeKeeper.create({ nav: w.nav, doc: w.doc, setTimeout: w.setTimeout, clearTimeout: w.clearTimeout, idleMs: o.idleMs || 60000, onRefused: o.onRefused, onChange: o.onChange, now: function () { return w.now; }, refusalBackoffMs: o.backoff }); };
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
  rk.poke(); rk.poke(); await tick(); check('poke() on every tap after a refusal does not ask again (back-off)', rw.requests === 1 && seen.length === 1);
  rw.reject = false; rw.advance(21000); rk.poke(); await tick(); check('after the wait the next poke tries again and works', rk.held && rw.requests === 2);

  var bw = world(), bk = bw.keeper(); bw.reject = true; bk.want(true); await tick(); bw.reject = false;
  bk.want(false); bk.want(true); await tick(); check('a real change of wish (off, on) ends the wait at once', bk.held && bw.requests === 2);
  var vw = world(), vk = vw.keeper(); vw.reject = true; vk.want(true); await tick(); vw.reject = false;
  vw.hide(); vw.show(); await tick(); check('the tab becoming visible ends the wait at once', vk.held && vw.requests === 2);
  var cw2 = world(), ck2 = cw2.keeper({ backoff: 0 }); cw2.reject = true; ck2.want(true); await tick(); ck2.poke(); await tick(); check('refusalBackoffMs: 0 turns the wait off', cw2.requests === 2);
  var fw = world(), fk = fw.keeper({ backoff: 5000 }); fw.reject = true; fk.want(true); await tick(); fw.reject = false; fw.advance(4000); fk.poke(); await tick(); check('a custom wait is respected (still waiting at 4 s of 5 s)', fw.requests === 1);
  fw.advance(1500); fk.poke(); await tick(); check('...and over at 5.5 s', fk.held && fw.requests === 2);

  var nw = world({ none: true }), nk = nw.keeper(); nk.want(true); nk.poke(); check('no wakeLock: supported false and nothing throws', nk.supported === false && !nk.held);

  var sw = world(), sk = sw.keeper(); sk.want(true); sk.want(false); await tick(); check('want(true) then want(false) at once ends with no lock held', !sk.held && sw.sentinels.every(function (s) { return s.released; }));
  var hw = world(), hk = hw.keeper(); hk.want(true); hw.hide(); await tick(); check('hidden before the request resolves: the late lock is released at once', !hk.held && hw.sentinels.every(function (s) { return s.released; }));

  // stale answers: the wish changed while a request was pending
  var ow = world(); ow.defer = true; var ok_ = ow.keeper();
  ok_.want(true); ok_.want(false); ok_.want(true); await tick();
  check('on-off-on while pending: the second want() waits for the first answer', ow.requests === 1);
  ow.answer(0, 'ok'); await tick(); await tick();
  check('on-off-on: the stale lock is released and a new request is made', ow.sentinels[0].released && ow.requests === 2 && !ok_.held);
  ow.answer(1, 'ok'); await tick(); check('on-off-on: the second answer is kept (lock held while playing)', ok_.held && !ow.sentinels[1].released);
  var sw2 = world(); sw2.defer = true; var sk2 = sw2.keeper();
  sk2.want(true); sw2.hide(); sw2.show(); await tick();
  sw2.answer(0, 'ok'); await tick(); await tick();
  check('hidden-then-shown while pending: stale lock released, new request made', sw2.sentinels[0].released && sw2.requests === 2);
  sw2.answer(1, 'ok'); await tick(); check('hidden-then-shown: ends holding a lock', sk2.held);
  var xw = world(); xw.defer = true; var xk = xw.keeper();
  xk.want(true); xk.want(false); xk.want(true); await tick(); xw.answer(0, 'fail'); await tick(); await tick();
  check('a stale refusal asks again once and is not counted as a refusal', xw.requests === 2 && xk.refusals === 0);
  var yw = world(); yw.defer = true; var yk = yw.keeper();
  yk.want(true); yk.want(false); await tick(); yw.answer(0, 'ok'); await tick(); await tick();
  check('on-off (no second on): late lock is released and nothing new is requested', yw.requests === 1 && yw.sentinels[0].released && !yk.held);
  var zw = world(); zw.defer = true; var zk = zw.keeper();
  zk.want(true); zk.destroy(); await tick(); zw.answer(0, 'ok'); await tick(); await tick();
  check('destroy() while pending: the late lock is released and nothing is requested', zw.sentinels[0].released && zw.requests === 1 && !zk.held);

  // after destroy()
  var qw = world(), qk = qw.keeper(); qk.destroy(); qk.want(true); qk.poke(); await tick();
  check('want() and poke() after destroy() do nothing', qw.requests === 0 && !qk.held && !qw.listeners.visibilitychange);

  // watchInput
  var iw = world(), ik = iw.keeper({ idleMs: 60000 }), tgt = { l: {}, addEventListener: function (t, f) { this.l[t] = f; }, removeEventListener: function (t) { delete this.l[t]; } };
  ik.want(true); await tick(); var stopW = ik.watchInput(tgt);
  check('watchInput listens to pointer, touch and key events', !!(tgt.l.pointerdown && tgt.l.touchstart && tgt.l.keydown));
  iw.advance(59000); tgt.l.keydown(); iw.advance(59000); await tick(); check('a key press through watchInput restarts the idle timer', ik.held);
  iw.advance(5000); await tick(); check('...and the lock is still released after the full idle time', !ik.held && ik.idle);
  tgt.l.pointerdown(); await tick(); check('input after an idle release asks again', ik.held);
  stopW(); check('the function watchInput returns removes the listeners', !tgt.l.pointerdown && !tgt.l.keydown);
  var tgt2 = { l: {}, addEventListener: function (t, f) { this.l[t] = f; }, removeEventListener: function (t) { delete this.l[t]; } }; ik.watchInput(tgt2); ik.destroy(); check('destroy() also stops watchInput', !tgt2.l.keydown);
  check('watchInput with no target does not throw', typeof WakeKeeper.create({ nav: {} }).watchInput(null) === 'function');

  var cw = world(), changes = [], ck = cw.keeper({ onChange: function (h) { changes.push(h); } }); ck.want(true); await tick(); ck.want(false); await tick(); check('onChange reports acquire then release', changes.join() === 'true,false');
  var dw = world(), dk = dw.keeper(); dk.want(true); await tick(); dk.destroy(); check('destroy releases and removes the listener', !dk.held && !dw.listeners.visibilitychange);
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
