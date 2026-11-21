/* Situation tables for back-close, run on the full files, on every lean build and in real browsers. Copyright (c) 2026 LFC Foundry. MIT License.
 * Plain JavaScript with no Node calls: Node (each module's test/lean.js, with fake browser pieces) and each real browser (tests/small-lean-browser.js, with the browser's own CloseWatcher
 * and Escape key) run these same lines.
 *   backCloseRows(BackClose, env)   -> Promise of rows, using only watchWhen(isOpen, close) and handle.sync(), the way Fancy Banana uses it
 * A row is { module, situation, expect, result: 'ok' | 'FAIL' | 'not available', note }. 'not available' means this browser lacks the API; it is never counted as a pass.
 * env: { G: window or global, node: true in Node, CloseWatcher: the class to build on (real or fake; undefined when the browser has none), tap(), esc(made), sleep(ms) } */
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
    return { G: G, node: true, CloseWatcher: withCW === false ? undefined : FakeCW, settleMs: 3, sleep: sleep, tap: async function () {},
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

  return { backCloseRows: backCloseRows, nodeEnv: nodeEnv, FakeCW: FakeCW };
});
