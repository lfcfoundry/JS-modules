/* The app-specific part of a fuzz run for example/app.html: operations, invariants, liveness. Injected after src/fuzz-core.js by the runners.
   Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules
   Defines window.__fuzzConfig(seed) -> the options object for new Fuzzer(...). This is the file you write for your own app. */
window.__fuzzConfig = function (seed) {
  var app = window.__app, I = Fuzzer.Input;
  app.stop();   // run the app by hand (app.step) so every run is exactly reproducible
  app.reset();
  return {
    seed: seed,
    ops: [
      { name: 'tap', weight: 6, run: function () { app.tap(); } },
      { name: 'click-tap-button', weight: 3, run: function () { document.getElementById('tap').click(); } },
      { name: 'buy', weight: 3, run: function () { document.getElementById('buy').click(); } },
      { name: 'pause-key', weight: 2, run: function () { I.key('p', true); I.key('p', false); } },
      { name: 'pause-button', weight: 2, run: function () { document.getElementById('pause').click(); } },
      { name: 'restart', weight: 1, run: function () { document.getElementById('restart').click(); } },
      { name: 'wait', weight: 5, run: function (c) { app.step(1 + c.int(250)); } },
      { name: 'click-anything-visible', weight: 2, run: function (c) { var l = I.clickables(); if (l.length) c.pick(l).click(); } }
    ].concat(Fuzzer.Real.ops()),   // real mouse and keyboard moves when the runner is started with --real-input (an empty list otherwise)
    invariants: [
      function () { return app.st.coins >= 0 ? '' : 'coins went negative: ' + app.st.coins; },
      function () { return ['coins', 'power', 'lives', 't'].every(function (k) { return isFinite(app.st[k]); }) ? '' : 'a number is not finite'; },
      function () { return ['title', 'play', 'paused', 'over'].indexOf(app.st.state) >= 0 ? '' : 'bad state ' + app.st.state; },
      function () { return app.st.lives >= 0 && app.st.lives <= 3 ? '' : 'lives out of range: ' + app.st.lives; },
      Fuzzer.Invariants.noJunkText()   // no NaN, undefined or [object ...] anywhere in the visible text
    ],
    // from wherever we are, ordinary input (tap, step, and now and then the pause key) must change something
    liveness: {
      every: 25, tries: 30,
      signature: function () { return [app.st.state, app.st.coins, app.st.lives, app.st.t, app.st.power].join(); },
      nudge: function (c, k) { if (k % 7 === 6) I.key('p', true), I.key('p', false); app.tap(); app.step(30); }
    },
    state: function () { return app.st.state; },
    afterFail: function () { app.reset(); }
  };
};
