/*!
 * tab-guard.js: keep only one open copy of a page "in charge", so two tabs (or two copies of a game) do not overwrite
 * each other's saved data. Uses the Web Locks API. No timers, no storage, no polling.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 JNFoo. MIT License (see LICENSE at the repository root).
 *
 *   var g = TabGuard.start({
 *     name: 'my-game-open',                       // same name = same guard; use one per saved game
 *     onTwin: function () { stopSaving(); showNotice(); },   // another copy is in charge (or just took over)
 *     onTakeOver: function () { location.reload(); }          // this copy won a takeOver(): reload to read the latest save
 *   });
 *   button.onclick = function () { g.takeOver(); };           // "Use this copy instead"
 *
 * The first copy to start holds a lock for as long as its page lives (the browser frees it when the tab closes or
 * crashes). A second copy finds the lock taken and calls onTwin. takeOver() steals the lock: the old copy is told
 * through its own onTwin, and the new copy gets onTakeOver. On a reload the old page may still hold the lock for a
 * moment, so a refused start is tried once more after `retryMs` before onTwin is called.
 *
 * Needs navigator.locks (Chrome 69+, Firefox 96+, Safari 15.4+, secure contexts and file: pages). Without it,
 * start() returns { supported: false } and calls nothing.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TabGuard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function start(o) {
    o = o || {};
    var name = o.name || 'tab-guard', retryMs = o.retryMs == null ? 700 : o.retryMs;
    var nav = typeof navigator !== 'undefined' ? navigator : null;
    var self = { supported: false, holding: false, twin: false, takeOver: function () {}, stop: function () {} };
    if (!nav || !nav.locks || !nav.locks.request) return self;
    self.supported = true;
    var release = null, stopped = false;

    function say(fn) { if (typeof fn === 'function') { try { fn(); } catch (e) { /* the page's own callback failed; keep the guard working */ } } }
    function lost() { self.holding = false; if (!self.twin) { self.twin = true; say(o.onTwin); } }

    function claim(opts, got, refused) {
      var p;
      try {
        p = nav.locks.request(name, opts, function (lock) {
          if (!lock) { refused(); return; }
          return new Promise(function (resolve) { release = resolve; got(); });   // hold until stop() or the page ends
        });
      } catch (e) { return; }
      // Stolen by another copy: the browser rejects our request with an AbortError.
      p.catch(function () { if (!stopped) lost(); });
    }

    function begin(again) {
      claim({ ifAvailable: true }, function () { self.holding = true; self.twin = false; say(o.onClaimed); }, function () {
        if (again && !stopped) setTimeout(function () { begin(false); }, retryMs);
        else if (!stopped) lost();
      });
    }

    self.takeOver = function () {
      if (stopped) return;
      claim({ steal: true }, function () { self.holding = true; self.twin = false; say(o.onTakeOver); }, function () {});
    };
    self.stop = function () { stopped = true; self.holding = false; if (release) { release(); release = null; } };
    begin(true);
    return self;
  }

  return { start: start, supported: typeof navigator !== 'undefined' && !!(navigator.locks && navigator.locks.request) };
});
