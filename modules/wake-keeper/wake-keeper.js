/*!
 * wake-keeper.js: keep the screen awake only while a game really wants it.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 JNFoo. MIT License (see LICENSE at the repository root).
 *
 *   var wk = WakeKeeper.create({ idleMs: 60000, onRefused: function (err) { ... } });
 *   wk.want(true);    // playing: ask for the lock      wk.want(false);  // paused, card open, title screen: give it back
 *   wk.poke();        // call on every tap or key: restarts the idle timer (and re-asks after an idle release)
 *
 * Rules it follows (the part people usually get wrong):
 *  - one lock at a time; a released lock is never reused, a new one is requested
 *  - released as soon as you stop wanting it, when the tab is hidden, and after `idleMs` without a poke()
 *  - asked for again when the tab becomes visible (the browser drops the lock when a tab is hidden) or after a poke()
 *  - a refusal (low battery, power saving, no permission, not supported) is not retried in a loop: onRefused runs once per
 *    attempt, and the next try waits for want(), poke() or the tab becoming visible
 * Needs navigator.wakeLock (Chrome 84+, Firefox 126+, Safari 16.4+). Without it, supported is false and nothing happens.
 * Everything the module touches is injectable (opts.nav, opts.doc, opts.setTimeout, opts.clearTimeout) so it can be tested without a browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WakeKeeper = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function create(opts) {
    opts = opts || {};
    var nav = opts.nav || (typeof navigator !== 'undefined' ? navigator : null);
    var doc = opts.doc || (typeof document !== 'undefined' ? document : null);
    var setT = opts.setTimeout || (typeof setTimeout !== 'undefined' ? setTimeout.bind(typeof self !== 'undefined' ? self : this) : null);
    var clearT = opts.clearTimeout || (typeof clearTimeout !== 'undefined' ? clearTimeout.bind(typeof self !== 'undefined' ? self : this) : null);
    var idleMs = opts.idleMs > 0 ? opts.idleMs : 60000;
    var supported = !!(nav && nav.wakeLock && typeof nav.wakeLock.request === 'function');
    var wanted = false, idle = false, sentinel = null, pending = false, timer = null, refusals = 0, gen = 0;
    var api = { supported: supported, want: want, poke: poke, destroy: destroy };
    Object.defineProperty(api, 'held', { get: function () { return !!sentinel; } });
    Object.defineProperty(api, 'refusals', { get: function () { return refusals; } });
    Object.defineProperty(api, 'idle', { get: function () { return idle; } });

    function visible() { return !doc || doc.visibilityState !== 'hidden'; }
    function note() { if (typeof opts.onChange === 'function') { try { opts.onChange(!!sentinel); } catch (e) { /* the page's callback failed */ } } }

    function release() {
      var s = sentinel; sentinel = null; gen++;
      if (s) { try { var r = s.release(); if (r && r.catch) r.catch(function () {}); } catch (e) { /* already released */ } note(); }
    }
    function startIdle() { if (timer && clearT) clearT(timer); timer = setT ? setT(function () { timer = null; idle = true; release(); }, idleMs) : null; }
    function acquire() {
      if (!supported || sentinel || pending || !wanted || idle || !visible()) return;
      pending = true; var my = ++gen;
      var p; try { p = nav.wakeLock.request('screen'); } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(function (s) {
        pending = false;
        if (my !== gen || !wanted || idle || !visible()) { try { s.release(); } catch (e) { /* ignore */ } return; }   // the situation changed while we waited
        sentinel = s;
        if (s.addEventListener) s.addEventListener('release', function () { if (sentinel === s) { sentinel = null; note(); } });
        note();
      }, function (err) {
        pending = false; refusals++;
        if (typeof opts.onRefused === 'function') { try { opts.onRefused(err); } catch (e) { /* the page's callback failed */ } }
      });
    }

    function want(on) {
      on = !!on; if (on === wanted) { if (on) acquire(); return; }
      wanted = on;
      if (on) { idle = false; startIdle(); acquire(); }
      else { if (timer && clearT) { clearT(timer); timer = null; } release(); }
    }
    function poke() { if (!wanted) return; idle = false; startIdle(); acquire(); }
    function onVis() { if (!doc) return; if (doc.visibilityState === 'hidden') release(); else acquire(); }
    if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVis);
    function destroy() { wanted = false; if (timer && clearT) { clearT(timer); timer = null; } release(); if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onVis); }
    return api;
  }

  return { create: create, supported: typeof navigator !== 'undefined' && !!(navigator.wakeLock && navigator.wakeLock.request) };
});
