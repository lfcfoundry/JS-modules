/* Situation tables for back-close and wake-keeper, run on the full files, on every lean build and in real browsers. Copyright (c) 2026 LFC Foundry. MIT License.
 * Plain JavaScript with no Node calls: Node (each module's test/lean.js, with fake browser pieces) and each real browser (tests/small-lean-browser.js, with the browser's own CloseWatcher,
 * wake lock and Escape key) run these same lines.
 *   backCloseRows(BackClose, env)   -> Promise of rows, using only watchWhen(isOpen, close) and handle.sync(), the way Fancy Banana uses it
 *   wakeKeeperRows(WakeKeeper, env) -> Promise of rows, using only create({ refusalBackoffMs: 8000 }), want(), destroy(), the way Fancy Banana uses it
 * A row is { module, situation, expect, result: 'ok' | 'FAIL' | 'not available', note }. 'not available' means this browser lacks the API; it is never counted as a pass.
 * env: { G: window or global, node: true in Node, CloseWatcher: the class to build on (real or fake; undefined when the browser has none), tap(), esc(made), realWakeLock: true when the browser's own lock is used, sleep(ms) } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.SmallLean = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function until(fn, ms) { var t = Date.now ? Date.now() : 0, end = (typeof performance !== 'undefined' ? performance.now() : 0) + (ms || 1500); while (!fn()) { if ((typeof performance !== 'undefined' ? performance.now() : 0) > end) return false; await sleep(10); } return true; }

  // ---- Node stand-ins ----
  function FakeCW() { this.dead = false; this.onclose = null; this.l = []; }
  FakeCW.prototype.addEventListener = function (t, f) { if (t === 'close') this.l.push(f); };
  FakeCW.prototype.destroy = function () { this.dead = true; };
  FakeCW.prototype.requestClose = function () { if (this.dead) return; this.dead = true; this.l.slice().forEach(function (f) { f(); }); if (this.onclose) this.onclose(); };
  function nodeEnv(G, withCW) {
    return { G: G, node: true, CloseWatcher: withCW === false ? undefined : FakeCW, realWakeLock: false, settleMs: 3, sleep: sleep, tap: async function () {},
      esc: async function (made) { var l = made.filter(function (w) { return !w.__dead; }); if (l.length) l[l.length - 1].requestClose(); } };
  }

  function make(module) { var rows = []; return { rows: rows, add: function (situation, expect, ok, note, na) { rows.push({ module: module, situation: situation, expect: expect, result: na ? 'not available' : ok ? 'ok' : 'FAIL', note: note || '' }); } }; }

  async function backCloseRows(BackClose, env) {
    var T = make('back-close'), G = env.G, Real = env.CloseWatcher, made = [], saved = G.CloseWatcher;
    function spy() {
      if (!Real) { G.CloseWatcher = undefined; return; }
      G.CloseWatcher = class extends Real {
        constructor() { super(); this.__dead = false; made.push(this); var me = this; this.addEventListener('close', function () { me.__dead = true; }); }
        destroy() { this.__dead = true; super.destroy(); }
      };
    }
    function live() { return made.filter(function (w) { return !w.__dead; }).length; }
    function panel() { var p = { open: false, closed: 0 }; p.h = BackClose.watchWhen(function () { return p.open; }, function () { p.closed++; p.open = false; }); return p; }
    try {
      // browser without CloseWatcher: Real is hidden on purpose, so this row runs everywhere
      G.CloseWatcher = undefined; made.length = 0;
      var err = null, n = null, h;
      try { n = { open: true }; h = BackClose.watchWhen(function () { return n.open; }, function () { n.open = false; }); h.sync(); n.open = false; h.sync(); h.destroy(); } catch (e) { err = e; }
      T.add('no CloseWatcher in the browser', 'nothing happens, no error', !err && h && h.supported === false && made.length === 0, err ? String(err.message) : '');

      if (!Real) {
        ['panel opens', 'panel closes by its own button', 'back swipe closes the panel, a second panel stays closable'].forEach(function (s) { T.add(s, 'a watcher is made / destroyed / closable', false, 'this browser has no CloseWatcher', true); });
        return T.rows;
      }
      spy(); made.length = 0;
      await env.tap(); var a = panel(); a.open = true; a.h.sync();
      T.add('panel opens', 'a watcher is made', live() === 1 && made.length === 1, 'live ' + live());
      a.open = false; a.h.sync();
      T.add('panel closes by its own button', 'the watcher is destroyed, the close function is not called', live() === 0 && a.closed === 0, 'live ' + live() + ', close calls ' + a.closed);
      a.h.destroy(); made.length = 0;
      await env.tap(); var p1 = panel(); p1.open = true; p1.h.sync();
      await env.tap(); var p2 = panel(); p2.open = true; p2.h.sync();
      var two = live() === 2;
      await env.esc(made); await until(function () { return p2.closed > 0; }, 1000); await env.sleep(env.settleMs || 50);
      var c1 = p1.closed, c2 = p2.closed, l1 = live(), firstOk = two && p2.closed === 1 && p1.closed === 0 && p1.open && live() === 1;
      await env.esc(made); await until(function () { return p1.closed > 0; }, 1000); await env.sleep(env.settleMs || 50);
      T.add('back swipe closes the panel, a second panel stays closable', 'newest panel closes first, the other keeps its watcher and closes on the next one', firstOk && p1.closed === 1 && !p1.open && live() === 0,
        'both armed ' + two + '; after the first request: newest closed ' + c2 + ' time(s), other closed ' + c1 + ', watchers left ' + l1 + '; after the second: other closed ' + p1.closed + ', watchers left ' + live());
      p1.h.destroy(); p2.h.destroy();
    } finally { G.CloseWatcher = saved; }
    return T.rows;
  }

  async function wakeKeeperRows(WakeKeeper, env) {
    var T = make('wake-keeper'), G = env.G, undo = [], requests = 0, sentinels = [], rejectNext = false, now = 1000000, vstate = 'visible', vl = [];
    function over(obj, prop, desc) { var had = Object.getOwnPropertyDescriptor(obj, prop); Object.defineProperty(obj, prop, Object.assign({ configurable: true }, desc)); undo.push(function () { if (had) Object.defineProperty(obj, prop, had); else delete obj[prop]; }); }
    var realNav = typeof navigator !== 'undefined' ? navigator : null, realWL = realNav && realNav.wakeLock, origReq = realWL && realWL.request ? realWL.request.bind(realWL) : null;
    var realUsable = false, why = '';
    function makeFake() { var s = { released: false, l: [], addEventListener: function (t, f) { if (t === 'release') s.l.push(f); }, release: function () { if (!s.released) { s.released = true; s.l.forEach(function (f) { f(); }); } return Promise.resolve(); } }; return s; }
    if (!env.node && origReq) { try { var probe = await origReq('screen'); realUsable = true; await probe.release(); } catch (e) { why = String(e && e.name || e); } }
    function request(type) {
      requests++;
      if (rejectNext) { rejectNext = false; return Promise.reject(Object.assign(new Error('refused'), { name: 'NotAllowedError' })); }
      var p = realUsable ? origReq(type) : Promise.resolve(makeFake());
      return p.then(function (s) { sentinels.push(s); return s; });
    }
    function locked() { return sentinels.some(function (s) { return !s.released; }); }
    function vis(s) { vstate = s; if (env.node) vl.slice().forEach(function (f) { f(); }); else document.dispatchEvent(new Event('visibilitychange')); }
    var wakeLockObj = { request: request };
    function install(withLock) {
      if (env.node) {
        over(G, 'navigator', { writable: true, value: withLock ? { wakeLock: wakeLockObj } : {} });
        over(G, 'document', { writable: true, value: { get visibilityState() { return vstate; }, addEventListener: function (t, f) { if (t === 'visibilitychange') vl.push(f); }, removeEventListener: function (t, f) { vl = vl.filter(function (x) { return x !== f; }); } } });
      } else {
        over(navigator, 'wakeLock', { get: function () { return withLock ? wakeLockObj : undefined; } });
        over(document, 'visibilityState', { get: function () { return vstate; } });
      }
      over(Date, 'now', { writable: true, value: function () { return now; } });
    }
    function restore() { while (undo.length) undo.pop()(); }
    async function settle() { await env.sleep(env.settleMs || 40); }
    var k;
    try {
      // no wake lock API: runs everywhere
      install(false); var err = null; requests = 0;
      try { k = WakeKeeper.create({ refusalBackoffMs: 8000 }); k.want(true); await settle(); k.want(false); k.destroy(); } catch (e) { err = e; }
      T.add('no wake lock in the browser', 'nothing is requested, no error', !err && requests === 0 && k.supported === false, err ? String(err.message) : '');
      restore();

      var haveAPI = env.node || !!origReq;
      if (!haveAPI) {
        ['run starts', 'tab hidden', 'tab back', 'run ends', 'request refused', 'lock released by the browser'].forEach(function (s) { T.add(s, 'lock requested / released as the table says', false, 'this browser has no navigator.wakeLock', true); });
        return T.rows;
      }
      var how = env.node ? 'stand-in lock' : realUsable ? 'the browser\'s own lock' : 'stand-in lock (the browser refused its own: ' + why + ')';
      install(true); vstate = 'visible'; requests = 0; sentinels = []; rejectNext = false;
      k = WakeKeeper.create({ refusalBackoffMs: 8000 });
      k.want(true); await until(function () { return locked(); }, 1500);
      T.add('run starts', 'lock requested (' + how + ')', requests === 1 && locked(), 'requests ' + requests + ', locked ' + locked());
      vis('hidden'); await settle(); var r2 = requests;
      T.add('tab hidden', 'lock released, nothing requested', !locked() && r2 === 1, 'requests ' + r2 + ', locked ' + locked());
      k.want(true); await settle();
      var r2b = requests;
      vis('visible'); await until(function () { return locked(); }, 1500);
      T.add('tab back', 'requested again', locked() && requests === r2b + 1, 'requests ' + requests + ', locked ' + locked() + (r2b !== r2 ? ' (asking while hidden made ' + (r2b - r2) + ' requests)' : ''));
      k.want(false); await settle();
      T.add('run ends', 'lock released', !locked(), 'locked ' + locked());
      // refused
      k.want(true); await until(function () { return locked(); }, 1500); k.want(false); await settle(); requests = 0;
      rejectNext = true; k.want(true); await settle();
      var afterRefuse = requests; k.want(true); k.want(true); await settle(); now += 7900; k.want(true); await settle(); var still = requests; now += 200; k.want(true); await until(function () { return locked(); }, 1500);
      T.add('request refused', 'no new request for 8 s, then one more that works', afterRefuse === 1 && still === 1 && requests === 2 && locked(), 'requests: after refusal ' + afterRefuse + ', at 7.9 s ' + still + ', at 8.1 s ' + requests + ', locked ' + locked());
      // released by the browser: calling release on the sentinel is what the browser's own drop looks like to the module (the 'release' event)
      var live = sentinels.filter(function (s) { return !s.released; }); live.forEach(function (s) { s.release(); }); await settle(); var dropped = !locked(); var before = requests;
      k.want(true); await until(function () { return locked(); }, 1500);
      T.add('lock released by the browser', 'requested again the next time the game asks', dropped && locked() && requests === before + 1, 'dropped ' + dropped + ', requests ' + before + ' -> ' + requests + ', locked ' + locked());
      k.want(false); k.destroy();
    } finally { restore(); }
    return T.rows;
  }
  return { backCloseRows: backCloseRows, wakeKeeperRows: wakeKeeperRows, nodeEnv: nodeEnv, FakeCW: FakeCW };
});
