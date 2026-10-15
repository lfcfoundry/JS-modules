/*!
 * fuzz-play/inpage.js: the same idea running INSIDE the page (no round trips, so it is fast), for browsers Playwright can't drive
 * (inject it through Marionette, see tools/marionette-lite, or paste it into a console).
 * Copyright (c) 2026 LFC Foundry. MIT License.
 *
 *   FuzzPlay.run({
 *     ms: 60000,
 *     steps: [ function () { document.querySelector('#go').click(); }, ... ],      // random actions
 *     check: function () { return state.count < 0 ? ['negative count'] : []; },     // return a list of problems
 *     stuck: function () { return busy && !overlayOpen ? 'busy but nothing shown' : ''; }   // optional
 *   });
 *   // then read window.__fuzzDone = { n, bad, errs }
 */
(function (root) {
  root.FuzzPlay = {
    run: function (o) {
      var n = 0, bad = [], errs = [], stuck = 0, end = Date.now() + (o.ms || 60000);
      root.__fuzzDone = null;
      root.addEventListener('error', function (e) { errs.push(String(e.message)); });
      root.addEventListener('unhandledrejection', function (e) { errs.push('REJ ' + e.reason); });
      (function loop() {
        if (Date.now() > end) { root.__fuzzDone = { n: n, bad: bad.slice(0, 8), errs: errs.slice(0, 8) }; return; }
        try { o.steps[Math.floor(Math.random() * o.steps.length)](); } catch (e) { errs.push('STEP ' + e.message); }
        n++;
        if (n % (o.every || 6) === 0) {
          try { var p = o.check ? o.check() : []; if (p.length) bad.push(n + ': ' + p.join(' | ')); } catch (e) { errs.push('CHECK ' + e.message); }
          if (o.stuck) { var s = o.stuck(); if (s) { if (++stuck > (o.stuckTicks || 60)) { bad.push('STUCK ' + s); stuck = 0; } } else stuck = 0; }
        }
        setTimeout(loop, 40 + Math.random() * 260);
      })();
    }
  };
})(typeof window !== 'undefined' ? window : this);
