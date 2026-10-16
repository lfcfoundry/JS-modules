/*!
 * wake-keeper.js: keep the screen awake only while a game really wants it.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   var wk = WakeKeeper.create({ idleMs: 60000, onRefused: function (err) { ... } });
 *   wk.want(true);    // playing: ask for the lock      wk.want(false);  // paused, card open, title screen: give it back
 *   wk.poke();        // call on every tap or key: restarts the idle timer (and re-asks after an idle release)
 *   wk.watchInput(document);   // optional: pokes for you on pointer, touch and key events (call the returned function to stop)
 *                              // controller play: call wk.poke() from your pad code as well (pad input is not a DOM event)
 *
 * Rules it follows (the part people usually get wrong):
 *  - one lock at a time; a released lock is never reused, a new one is requested
 *  - released as soon as you stop wanting it, when the tab is hidden, and after `idleMs` without a poke()
 *  - asked for again when the tab becomes visible (the browser drops the lock when a tab is hidden) or after a poke()
 *  - a refusal (low battery, power saving, no permission, a frame the host did not allow) is not retried in a loop: onRefused
 *    runs once per attempt, and nothing asks again for `refusalBackoffMs` (default 20 s) unless want() really changes or the
 *    tab becomes visible again. So calling poke() on every tap cannot cause a storm of failing requests.
 *  - if the answer to an old request arrives after the situation changed (off then on, hidden then shown), that lock is
 *    released and, if the game still wants one, a fresh request is made
 * Needs navigator.wakeLock (Chrome 84+, Firefox 126+, Safari 16.4+). Without it, supported is false and nothing happens.
 * Everything the module touches is injectable (opts.nav, opts.doc, opts.setTimeout, opts.clearTimeout, opts.now) so it can be tested without a browser.
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
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var backoffMs = opts.refusalBackoffMs >= 0 ? opts.refusalBackoffMs : 20000;
    var supported = !!(nav && nav.wakeLock && typeof nav.wakeLock.request === 'function');
    var wanted = false, idle = false, sentinel = null, pending = false, timer = null, refusals = 0, gen = 0;
    var blockedUntil = 0, dead = false, watchers = [];
    var api = { supported: supported, want: want, poke: poke, destroy: destroy, watchInput: watchInput };
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
      if (dead || !supported || sentinel || pending || !wanted || idle || !visible() || now() < blockedUntil) return;
      pending = true; var my = ++gen;
      var p; try { p = nav.wakeLock.request('screen'); } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(function (s) {
        pending = false;
        if (dead || my !== gen || !wanted || idle || !visible()) {                                            // the situation changed while we waited
          try { var r = s.release(); if (r && r.catch) r.catch(function () {}); } catch (e) { /* ignore */ }
          acquire();                                                                                          // still wanted? ask again (no-op if not)
          return;
        }
        sentinel = s;
        if (s.addEventListener) s.addEventListener('release', function () { if (sentinel === s) { sentinel = null; note(); } });
        note();
      }, function (err) {
        pending = false;
        if (dead) return;
        if (my !== gen) { acquire(); return; }                       // an old request failed after the situation changed: ask afresh, do not count it
        refusals++; blockedUntil = now() + backoffMs;
        if (typeof opts.onRefused === 'function') { try { opts.onRefused(err); } catch (e) { /* the page's callback failed */ } }
      });
    }

    function want(on) {
      if (dead) return;
      on = !!on; if (on === wanted) { if (on) acquire(); return; }
      wanted = on; blockedUntil = 0;                                 // a real change of wish ends any refusal wait
      if (on) { idle = false; startIdle(); acquire(); }
      else { if (timer && clearT) { clearT(timer); timer = null; } release(); }
    }
    function poke() { if (dead || !wanted) return; idle = false; startIdle(); acquire(); }
    function onVis() { if (dead || !doc) return; if (doc.visibilityState === 'hidden') release(); else { blockedUntil = 0; acquire(); } }
    if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVis);
    // Pokes for you on pointer, touch and key events (at most once a second). Returns a function that stops it. Never throws.
    function watchInput(target, events) {
      var names = events || ['pointerdown', 'touchstart', 'keydown'], last = -1e12, on = [];
      function h() { var t = now(); if (t - last < 1000) return; last = t; poke(); }
      if (!dead && target && target.addEventListener) {
        for (var i = 0; i < names.length; i++) { try { target.addEventListener(names[i], h, { passive: true }); on.push(names[i]); } catch (e) { /* skip this event */ } }
      }
      function stop() { for (var i = 0; i < on.length; i++) { try { target.removeEventListener(on[i], h); } catch (e) { /* gone */ } } on = []; }
      watchers.push(stop);
      return stop;
    }
    function destroy() {
      dead = true; wanted = false; if (timer && clearT) { clearT(timer); timer = null; } release();
      if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onVis);
      for (var i = 0; i < watchers.length; i++) watchers[i](); watchers = [];
    }
    return api;
  }

  return { create: create, supported: typeof navigator !== 'undefined' && !!(navigator.wakeLock && navigator.wakeLock.request) };
});
