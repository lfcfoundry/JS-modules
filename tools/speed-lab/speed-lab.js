/*!
 * speed-lab.js: a one-button speed test for a page, run on the device that has the problem. No dependencies.
 * You describe the comparison as data (steps: what to switch on or off, measured for a few seconds each). It runs them one after another, keeps the
 * thing you are measuring in view and uncovered, redoes a step that was disturbed, and says the answer in plain sentences plus a table you can copy.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   SpeedLab.panel({ scene: document.querySelector("#play"), bar: "#stickyBar", steps: [
 *     { id: "A", role: "baseline", label: "Nothing moving" },
 *     { id: "B", role: "load",     label: "Everything moving", setup: startTheWork },          // setup may return a function that stops it
 *     { id: "C", role: "variant",  label: "Everything moving, glow not drawn", css: ".glow{visibility:hidden!important}", setup: startTheWork },
 *     { id: "Z", role: "heat",     label: "Nothing moving again" } ] });
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpeedLab = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var f1 = function (x) { return Math.round(x * 10) / 10; }, pc = function (x) { return Math.round(x) + '%'; };

  /**
   * What the frame gaps (milliseconds between drawn frames) of one step say. lo: { n, ms } for the page's own long busy moments (Chromium only).
   * fps; med: the usual frame time; slow: the average of the slowest 5% of frames; worst; lost: percent of the time lost to frames later than 1.5 times the usual;
   * late: how many frames that is; big: stutters over 50 ms (and over 3 times the usual).
   */
  function stat(d, lo) {
    lo = lo || { n: 0, ms: 0 };
    if (!d || d.length < 5) return { fps: 0, med: 0, slow: 0, worst: 0, lost: 0, late: 0, big: 0, n: d ? d.length : 0, loaf: lo.n, loafMs: lo.ms };
    var sum = 0, i; for (i = 0; i < d.length; i++) sum += d[i];
    var s = d.slice().sort(function (a, b) { return b - a; }), k = Math.max(1, Math.round(d.length * 0.05)), top = 0;
    for (i = 0; i < k; i++) top += s[i];
    var med = s[Math.floor(s.length / 2)], lostMs = 0, late = 0, big = 0;
    for (i = 0; i < d.length; i++) { if (d[i] > med * 1.5) { late++; lostMs += d[i] - med; } if (d[i] > Math.max(50, med * 3)) big++; }
    return { fps: 1000 * d.length / sum, med: med, slow: top / k, worst: s[0], lost: 100 * lostMs / sum, late: late, big: big, n: d.length, loaf: lo.n, loafMs: lo.ms };
  }

  /**
   * The plain-sentence answer. results: steps in order, each { id, label, role, fps, lost, big, loaf, bad? }. Roles: baseline (nothing going on), load (the thing under test),
   * variant (the load with something turned off), heat (the baseline again at the end). Returns [{ kind: 'big' | 'warn' | 'ok', text }].
   */
  function verdict(results, opts) {
    opts = opts || {};
    var L = [], by = {}, base = null, load = null, heat = null, vars = [];
    results.forEach(function (r) { by[r.id] = r; if (r.role === 'baseline' && !base) base = r; else if (r.role === 'load' && !load) load = r; else if (r.role === 'variant') vars.push(r); else if (r.role === 'heat') heat = r; });
    (opts.notes || []).forEach(function (n) { L.push({ kind: 'warn', text: n }); });
    var badSteps = results.filter(function (r) { return r.bad; });
    if (badSteps.length) L.push({ kind: 'warn', text: 'Careful: ' + badSteps.length + ' step' + (badSteps.length === 1 ? ' was' : 's were') + ' disturbed (' + badSteps.map(function (r) { return r.id + ': ' + r.bad; }).join('; ') + '), so those numbers may be wrong.' });
    var closed = Object.keys(opts.closed || {});
    if (closed.length) L.push({ kind: 'warn', text: 'The test closed these things that were covering the page: ' + closed.map(function (k) { return k + ' (' + opts.closed[k] + ' time' + (opts.closed[k] === 1 ? '' : 's') + ')'; }).join(', ') + '.' });
    if (!base || !load) { L.push({ kind: 'warn', text: 'The comparison needs one baseline step and one load step to give an answer. The table below has the numbers.' }); return L; }
    L.push({ kind: 'big', text: base.label + ': ' + Math.round(base.fps) + ' frames per second, ' + pc(base.lost) + ' of the time lost to late frames. ' + load.label + ': ' + Math.round(load.fps) + ' fps, ' + pc(load.lost) + ' lost, ' + load.big + ' big stutter' + (load.big === 1 ? '' : 's') + '.' });
    var hurt = load.fps < base.fps * 0.88 || load.lost > base.lost + 4 || load.big > base.big + 2;
    if (!hurt) L.push({ kind: 'warn', text: '"' + load.label + '" did not make this device stutter in the test. If the real thing still feels choppy, the cost is probably in the graphics chip drawing the frames, which frame timing cannot see. Tell the person who built the test whether it felt choppy during the run.' });
    else L.push({ kind: 'warn', text: '"' + load.label + '" DID make this device stutter (' + Math.round(base.fps) + ' to ' + Math.round(load.fps) + ' fps, lost time ' + pc(base.lost) + ' to ' + pc(load.lost) + '), so the test reproduces the problem.' });
    var best = null;
    if (hurt) vars.forEach(function (x) {
      var better = x.fps >= load.fps + 6 || (load.lost - x.lost >= 3 && x.lost <= load.lost * 0.6) || (load.big >= 3 && x.big <= load.big / 2);
      if (!better) return;
      L.push({ kind: 'ok', text: x.label + ' helped: ' + Math.round(load.fps) + ' to ' + Math.round(x.fps) + ' fps, lost time ' + pc(load.lost) + ' to ' + pc(x.lost) + '.' });
      var gain = (x.fps - load.fps) + (load.lost - x.lost); if (!best || gain > best[1]) best = [x.label, gain];
    });
    if (hurt && vars.length && !best) L.push({ kind: 'warn', text: 'None of the variants helped by itself, so the cost is not in the parts this test switches off.' });
    if (hurt && best) L.push({ kind: 'ok', text: 'Biggest help: ' + best[0] + '.' });
    var tot = 0; results.forEach(function (r) { tot += r.loaf || 0; });
    if (tot) L.push({ kind: 'warn', text: 'The page itself was busy too long in ' + tot + ' moment' + (tot === 1 ? '' : 's') + ' during the test (table, last column).' });
    if (heat && (heat.fps < base.fps * 0.85 || heat.lost > base.lost + 4)) L.push({ kind: 'warn', text: 'The device got slower over the test (' + Math.round(base.fps) + ' to ' + Math.round(heat.fps) + ' fps with nothing going on), probably from heat, so later steps are unfairly slow.' });
    return L;
  }

  /** The table and sentences as plain text, to paste into a message. */
  function report(res, head) {
    var t = [head || 'Speed test | ' + new Date().toLocaleString()];
    if (typeof navigator !== 'undefined') t.push(navigator.userAgent);
    if (typeof screen !== 'undefined') t.push('screen ' + screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x | window ' + innerWidth + 'x' + innerHeight);
    t.push('');
    res.verdict.forEach(function (l) { t.push(l.text); });
    t.push('', 'step | fps | median frame ms | time lost % | late frames | big stutters (>50 ms) | slowest 5% ms | worst ms | frames | busy-page moments | busy-page ms | area showing % | tries | problem');
    res.steps.forEach(function (r) { t.push(r.id + ' ' + r.label + ' | ' + f1(r.fps) + ' | ' + f1(r.med) + ' | ' + f1(r.lost) + ' | ' + r.late + ' | ' + r.big + ' | ' + f1(r.slow) + ' | ' + f1(r.worst) + ' | ' + r.n + ' | ' + r.loaf + ' | ' + f1(r.loafMs) + ' | ' + r.vis + ' | ' + r.tries + ' | ' + (r.bad || '')); });
    return t.join('\n');
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function el(x) { return typeof x === 'string' ? document.querySelector(x) : (typeof x === 'function' ? x() : x); }

  /**
   * Runs the comparison. opts:
   *   steps: [{ id, label, role, css, setup(ctx) }]    css is added to the page for the step; setup runs at its start and may return a function that undoes it.
   *   scene: the part you are measuring (element, selector or function). It is scrolled so about half of it shows (showFraction) below the sticky bar, and a step
   *          where less than 30% of it shows, or something covers it, is marked disturbed and redone (up to tries, 3).
   *   bar: the sticky bar that covers the top of the page (element, selector or function), so its height is not counted as visible.
   *   covers: [{ name, test(), close() }]    things that can cover the page (a card, a help panel); they are closed before each step.
   *   stepMs (4500), warmMs (1100: dropped from each step), settleMs (250), coverTries (50) and coverWaitMs (300: how hard and how long to try closing a cover), notes() (extra warnings for the answer), onProgress(i, n, step), header (first line of the report).
   * Resolves with { steps, verdict, text, closed }.
   */
  function run(opts) {
    var steps = opts.steps || [], STEP = opts.stepMs || 4500, WARM = opts.warmMs === undefined ? 1100 : opts.warmMs, TRIES = opts.tries || 3, SHOW = opts.showFraction || 0.5;
    var sty = document.createElement('style'); sty.setAttribute('data-speed-lab', ''); document.head.appendChild(sty);
    var closed = {}, LO = { n: 0, ms: 0 }, loOn = false, po = null, scene = function () { return el(opts.scene); }, barB = function () { var b = el(opts.bar); try { return b ? b.getBoundingClientRect().bottom : 0; } catch (e) { return 0; } };
    try { po = new PerformanceObserver(function (l) { if (!loOn) return; l.getEntries().forEach(function (e) { LO.n++; LO.ms += e.duration; }); }); po.observe({ type: 'long-animation-frame' }); } catch (e) { po = null; }
    function visFrac() { var s = scene(); if (!s) return 1; var r = s.getBoundingClientRect(); return r.height ? Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, barB())) / r.height : 0; }
    function scrollHalf() { var s = scene(); if (!s) return; var r = s.getBoundingClientRect(); window.scrollTo(0, Math.max(0, window.pageYOffset + r.top - (barB() - r.height * (1 - SHOW)))); }
    function covering() { var c = opts.covers || [], i; for (i = 0; i < c.length; i++) { try { if (c[i].test()) return c[i]; } catch (e) { /* a broken test counts as not covering */ } } return null; }
    async function clearCovers() {
      for (var i = 0; i < (opts.coverTries || 50); i++) { var c = covering(); if (!c) return ''; closed[c.name] = (closed[c.name] || 0) + 1; try { c.close(); } catch (e) { /* tried */ } await sleep(opts.coverWaitMs === undefined ? 300 : opts.coverWaitMs); }
      var left = covering(); return left ? left.name : '';
    }
    function frames(ms) {
      return new Promise(function (done) {
        var d = [], last = 0, t0 = performance.now(), warm = true;
        (function f(t) {
          if (last && !warm) d.push(t - last);
          last = t;
          if (warm && t - t0 >= WARM) { warm = false; last = 0; }
          if (t - t0 < WARM + ms) requestAnimationFrame(f); else done(d);
        })(performance.now());
      });
    }
    return (async function () {
      var out = [];
      try {
        for (var i = 0; i < steps.length; i++) {
          var s = steps[i], r = null, undo = null, tries;
          if (opts.onProgress) opts.onProgress(i, steps.length, s);
          for (tries = 1; tries <= TRIES; tries++) {
            await clearCovers();
            sty.textContent = s.css || '';
            try { undo = s.setup ? s.setup({ step: s, scene: scene() }) : null; if (undo && typeof undo.then === 'function') undo = await undo; } catch (e) { undo = null; }
            scrollHalf(); await sleep(opts.settleMs === undefined ? 250 : opts.settleMs); scrollHalf();
            var v0 = visFrac(); LO = { n: 0, ms: 0 }; loOn = true;
            var fr = await frames(STEP); loOn = false; r = stat(fr, LO);
            r.vis = Math.round(Math.min(v0, visFrac()) * 100);
            var cv = covering(); r.bad = cv ? cv.name + ' was on screen' : (r.vis < 30 ? 'the part being measured was hidden' : '');
            if (typeof undo === 'function') { try { undo(); } catch (e) { /* tried */ } }
            if (!r.bad) break;
          }
          r.id = s.id; r.label = s.label; r.role = s.role || ''; r.tries = Math.min(tries, TRIES);
          out.push(r);
        }
      } finally { sty.remove(); if (po) po.disconnect(); }
      var notes = typeof opts.notes === 'function' ? opts.notes() : (opts.notes || []);
      var res = { steps: out, closed: closed };
      res.verdict = verdict(out, { notes: notes, closed: closed });
      res.text = report(res, opts.header);
      return res;
    })();
  }

  /**
   * One button on the page: Start, a progress bar, then the answer in plain sentences, a table, Run again and Copy results. opts: everything run() takes, plus
   * title, intro, container (default: a panel fixed at the bottom of the page), onDone(result).
   */
  function panel(opts) {
    var n = (opts.steps || []).length, secs = Math.round(n * ((opts.stepMs || 4500) + (opts.warmMs === undefined ? 1100 : opts.warmMs) + 400) / 1000 + 3);
    var box = document.createElement('div'); box.setAttribute('data-speed-lab-panel', '');
    box.style.cssText = opts.container ? '' : 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;max-height:62vh;overflow:auto;box-sizing:border-box;background:#121420;color:#fff;font:500 14px/1.35 system-ui,sans-serif;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px))';
    var btn = 'font:700 15px system-ui,sans-serif;color:#111;background:#ffe58a;border:0;border-radius:8px;padding:10px 14px;min-height:42px;margin:6px 6px 0 0;cursor:pointer';
    box.innerHTML = '<h2 style="margin:0 0 4px;font:800 16px system-ui,sans-serif"></h2><div data-msg></div><div data-barw hidden style="height:8px;border-radius:4px;background:#39405a;margin:8px 0 4px;overflow:hidden"><i data-bar style="display:block;height:100%;width:0;background:#7dff9a"></i></div>' +
      '<div data-live hidden style="font-weight:700"></div><div data-out hidden></div><button type="button" data-go style="' + btn + ';background:#7dff9a;font-size:17px">Start test</button><button type="button" data-copy hidden style="' + btn + '">Copy results</button><button type="button" data-hide hidden style="' + btn + '">Hide this panel</button>';
    var q = function (s) { return box.querySelector(s); }, last = null;
    q('h2').textContent = opts.title || 'Speed test';
    q('[data-msg]').textContent = opts.intro || ('Press Start and leave the screen alone for about ' + (secs < 100 ? secs + ' seconds' : Math.round(secs / 60 * 10) / 10 + ' minutes') + '. It runs every comparison by itself and tells you the answer here. The page may flicker.');
    (opts.container || document.body).appendChild(box);
    var running = false;
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    function render(res) {
      var h = '', col = { big: '#fff', warn: '#ffd166', ok: '#7dff9a' };
      res.verdict.forEach(function (l) { h += '<div style="margin-top:6px;color:' + col[l.kind] + (l.kind === 'big' ? ';font-weight:700' : '') + '">' + esc(l.text) + '</div>'; });
      h += '<table style="border-collapse:collapse;width:100%;margin-top:8px;font:12px/1.3 ui-monospace,monospace"><tr><td></td><td align=right>fps</td><td align=right>time lost</td><td align=right>big</td><td align=right>area showing</td></tr>';
      res.steps.forEach(function (r) { h += '<tr style="border-top:1px solid #39405a"><td>' + esc(r.id + '. ' + r.label) + '</td><td align=right>' + Math.round(r.fps) + '</td><td align=right>' + pc(r.lost) + '</td><td align=right>' + r.big + '</td><td align=right>' + r.vis + '%' + (r.bad ? ' (' + esc(r.bad) + ')' : '') + '</td></tr>'; });
      q('[data-out]').innerHTML = h + '</table>'; q('[data-out]').hidden = false;
    }
    async function go() {
      if (running) return; running = true;
      ['[data-go]', '[data-copy]', '[data-hide]', '[data-out]'].forEach(function (s) { q(s).hidden = true; });
      q('[data-barw]').hidden = false; q('[data-live]').hidden = false; q('[data-msg]').textContent = 'Testing. Please do not touch the screen.';
      var user = opts.onProgress;
      var res = await run(Object.assign({}, opts, { onProgress: function (i, total, s) { q('[data-bar]').style.width = (i / total * 100) + '%'; q('[data-live]').textContent = 'Step ' + (i + 1) + ' of ' + total + ': ' + s.label; if (user) user(i, total, s); } }));
      last = res; q('[data-bar]').style.width = '100%'; q('[data-live]').hidden = true; q('[data-barw]').hidden = true;
      q('[data-msg]').textContent = 'Done. The answer is below. Press Copy results to paste it into a message.';
      render(res); q('[data-go]').textContent = 'Run again'; ['[data-go]', '[data-copy]', '[data-hide]'].forEach(function (s) { q(s).hidden = false; });
      running = false; if (opts.onDone) opts.onDone(res);
    }
    q('[data-go]').onclick = go;
    q('[data-hide]').onclick = function () { box.style.display = 'none'; };
    q('[data-copy]').onclick = function () {
      var b = q('[data-copy]'), done = function () { b.textContent = 'Copied!'; setTimeout(function () { b.textContent = 'Copy results'; }, 2000); };
      var fb = function () { var a = document.createElement('textarea'); a.value = last.text; a.style.cssText = 'position:fixed;left:0;top:0;width:90%;height:50%;z-index:2147483647'; document.body.appendChild(a); a.focus(); a.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* no */ } if (ok) { document.body.removeChild(a); done(); } else b.textContent = 'Select the text and copy it'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(last.text).then(done, fb); else fb();
    };
    return { element: box, start: go, result: function () { return last; }, destroy: function () { if (box.parentNode) box.parentNode.removeChild(box); } };
  }

  return { run: run, panel: panel, stat: stat, verdict: verdict, report: report };
}));
