/* A zero-game-code adapter: random clicks on visible controls, taps near the middle of the screen, key presses, scrolling and short waits,
   with one rule checked after every move: no NaN, undefined or [object ...] in the visible text.
   Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules
   Use it for a first look at any click-style page (it replaces the old fuzz-play "dom-actions" file):
     python3 tools/fuzz-kit/runner/fuzz_playwright.py file:///path/game.html tools/fuzz-kit/example/generic-adapter.js --seeds 1-10 --ops 300
   Limits: it knows nothing about your rules, so it finds crashes and junk text, not wrong numbers; the short waits use real time, so a run is the same moves
   but not exactly the same game (an adapter that steps the app by hand, like adapter.js, repeats exactly). Links are not clicked (see Fuzzer.Input.clickables).
   Add --real-input to the runner to include real mouse and keyboard moves. */
window.__fuzzConfig = function (seed) {
  var I = Fuzzer.Input;
  function pause(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  return {
    seed: seed,
    ops: [
      { name: 'click-control', weight: 6, run: function (c) { var l = I.clickables(); if (l.length) c.pick(l).click(); } },
      { name: 'tap-near-middle', weight: 4, run: function (c) {
        var n = 1 + c.int(10), k, x, y, t;
        for (k = 0; k < n; k++) {
          x = innerWidth / 2 + (c.rand() - 0.5) * 80; y = innerHeight / 2 + (c.rand() - 0.5) * 80; t = document.elementFromPoint(x, y);
          if (t && t.closest && t.closest('a[href], [download]')) continue;   // never follow a link or start a download
          I.pointer(t, 'pointerdown', x, y, 'touch'); I.pointer(t, 'pointerup', x, y, 'touch');
          if (t && t.click) t.click();
        }
      } },
      { name: 'key', weight: 1, run: function (c) { var key = c.pick(['Escape', 'Enter', ' ', 'Tab', 'ArrowDown', 'ArrowUp']); I.key(key, true); I.key(key, false); } },
      { name: 'scroll', weight: 1, run: function (c) { window.scrollTo(0, c.int(900)); } },
      { name: 'wait', weight: 3, run: function (c) { return pause(20 + c.int(180)); } }
    ].concat(Fuzzer.Real.ops()),
    invariants: [Fuzzer.Invariants.noJunkText()],
    state: function () { return document.title; }
  };
};
