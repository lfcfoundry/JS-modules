/*!
 * field-report.js: two hidden buttons for a game or app, so a person on a real phone or laptop can hand over what happened.
 * "Save speed report" writes start-up time, frames a second, the slowest frames and heavy tasks, with a plain verdict.
 * "Save error log" writes every error the page raised, in plain words. Both save one small Markdown file on the device. No network.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.2 (API 1)
 *
 *   <script src="field-report.js"></script>      // put it FIRST, so errors during start-up are caught too
 *   var fr = FieldReport.start({ name: 'my-game', version: '2026.10.22.1700' });
 *   // 5 quick taps in the top-left corner of the page open a small panel with the two buttons (nothing is drawn until then).
 *   fr.mark('first-screen');                                  // optional: the moment the first screen is ready
 *   var map = fr.task('bake-sprites', function () { return bake(); });   // optional: time one heavy job and keep the answer
 *   fr.time('load-level', 41.5);                              // optional: record a time you measured yourself (ms)
 *   fr.speedText();  fr.errorsText();                         // the two reports as Markdown text
 *   fr.open();  fr.close();  fr.saveSpeed();  fr.saveErrors();  fr.stop();
 *
 * Options: name (file names), version (your release stamp, shown in the reports), corner ('top-left' | 'top-right' | 'bottom-left' |
 * 'bottom-right'), taps (5) within ms (2500) in a square of `size` px (64), fps (60: what "smooth" means for this page), frames (true:
 * watch frames from the start), console (true: also keep console.error and console.warn lines), onSave(text, fileName, kind) (replace the
 * file download, for example to share it), onOpen / onClose.
 *
 * What it records, and the limits:
 *  - Start-up: time to DOMContentLoaded, to load and to first paint (from the browser's own timeline), plus every mark() you add.
 *  - Frames: one tiny requestAnimationFrame loop keeps the last 3,600 frame times in a ring (no garbage per frame). Frames while the page is
 *    hidden are dropped. The report shows frames a second on average, the speed of the slowest 1% of frames, the slowest five, and how many
 *    frames took over 33, 50 and 100 ms.
 *  - Heavy tasks: task() and time() entries, and the browser's own long tasks where it reports them (Chromium does; Firefox and Safari do not).
 *  - Errors: uncaught errors, unhandled promise rejections, files that failed to load, page-policy (CSP) blocks, and console.error / console.warn
 *    (the original console still prints). Repeats of the same line are counted; the last 200 different lines are kept. Errors raised before this file
 *    ran cannot be seen.
 *  - Nothing leaves the device: no network request is made, and the files hold no names, only the browser string, core count, memory class,
 *    screen size and the numbers above. The panel is drawn only on request, with element styles (no <style> tag), so it works under a strict page policy.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FieldReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.2';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()); }
  function r1(x) { return Math.round(x * 10) / 10; }
  function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function one(s) { return String(s).replace(/\s+/g, ' ').replace(/\|/g, '/'); }

  // ---- pure helpers (also used by the tests) ----
  /** Numbers from a list of frame times (ms): count, average frames a second, frames a second of the slowest 1%, slowest five, counts over 33/50/100 ms. */
  function frameStats(dts) {
    var n = dts.length, s = { frames: n, fps: 0, low1: 0, slowest: [], over33: 0, over50: 0, over100: 0, ms: 0 }, i, sum = 0, sorted, k;
    if (!n) return s;
    sorted = new Array(n);
    for (i = 0; i < n; i++) { var v = dts[i]; sum += v; sorted[i] = v; if (v > 33.4) s.over33++; if (v > 50) s.over50++; if (v > 100) s.over100++; }
    sorted.sort(function (a, b) { return a - b; });
    s.ms = sum;
    s.fps = sum > 0 ? 1000 * n / sum : 0;
    k = Math.min(n - 1, Math.floor(n * 0.99));
    s.low1 = sorted[k] > 0 ? 1000 / sorted[k] : 0;
    for (i = n - 1; i >= 0 && s.slowest.length < 5; i--) s.slowest.push(sorted[i]);
    return s;
  }
  /** A plain-words verdict for the speed report. target: what a smooth page runs at (60 by default). */
  function speedVerdict(st, tasks, startupMs, target) {
    var t = target || 60, lines = [], grade, worstTask = 0, i;
    for (i = 0; i < tasks.length; i++) if (tasks[i].ms > worstTask) worstTask = tasks[i].ms;
    if (st.frames < 30) return { grade: 'not enough', text: 'Not enough frames were drawn to judge (' + st.frames + '). Play for a few seconds with the page in front, then save again.' };
    var slowest = st.slowest[0] || 0;
    if (st.fps >= 0.9 * t && st.low1 >= 0.55 * t && st.over100 === 0) grade = 'smooth';
    else if (st.fps >= 0.75 * t && st.over100 <= 2) grade = 'mostly smooth';
    else if (st.fps >= 0.5 * t) grade = 'uneven';
    else grade = 'slow';
    lines.push(grade.charAt(0).toUpperCase() + grade.slice(1) + '. ' + r1(st.fps) + ' FPS on average (higher is better), the slowest 1% of frames run at ' + r1(st.low1) + ' FPS, the slowest frame took ' + r1(slowest) + ' ms (lower is better), ' + st.over100 + ' frame(s) took over 100 ms.');
    if (worstTask > 50) lines.push('A heavy task took ' + r1(worstTask) + ' ms in one piece, which freezes the page for that long; slice it or move it to a worker.');
    if (startupMs && startupMs > 3000) lines.push('The first paint came after ' + Math.round(startupMs) + ' ms, which feels slow on a phone.');
    return { grade: grade, text: lines.join(' ') };
  }
  /** Markdown for a list of error entries. */
  function errorsMarkdown(head, entries, dropped) {
    var out = head.slice(0), kinds = {}, i, e, n = 0;
    for (i = 0; i < entries.length; i++) { e = entries[i]; n += e.count; kinds[e.kind] = (kinds[e.kind] || 0) + e.count; }
    if (!entries.length) out.push('**No errors were recorded.**', '');
    else {
      var parts = [], k;
      for (k in kinds) if (Object.prototype.hasOwnProperty.call(kinds, k)) parts.push(kinds[k] + ' ' + k);
      out.push('**' + n + ' error line(s), ' + entries.length + ' different:** ' + parts.join(', ') + '.' + (dropped ? ' ' + dropped + ' older line(s) were dropped to keep the list short.' : ''), '');
      out.push('| # | Seconds in | Kind | Times | What |', '|---|---:|---|---:|---|');
      for (i = 0; i < entries.length; i++) { e = entries[i]; out.push('| ' + (i + 1) + ' | ' + r1(e.at / 1000) + ' | ' + e.kind + ' | ' + e.count + ' | ' + one(clip(e.text, 300)) + ' |'); }
      out.push('');
      for (i = 0; i < entries.length; i++) if (entries[i].stack) { out.push('Stack of #' + (i + 1) + ':', '', '```', clip(entries[i].stack, 700), '```', ''); }
    }
    return out.join('\n');
  }

  function start(o) {
    o = o || {};
    var win = typeof window !== 'undefined' ? window : null, doc = typeof document !== 'undefined' ? document : null;
    var perf = typeof performance !== 'undefined' ? performance : null;
    var name = o.name || 'page', version = o.version || '', target = o.fps || 60, keep = 3600, maxErrs = 200;
    var needTaps = o.taps || 5, within = o.within || 2500, size = o.size || 64, corner = o.corner || 'top-left';
    var now = function () { return perf && perf.now ? perf.now() : Date.now(); };
    var t0 = now(), stopped = false;
    var fr = { version: VERSION, supported: !!(win && doc) };

    // ---- frames ----
    var ring = typeof Float32Array === 'function' ? new Float32Array(keep) : new Array(keep), rn = 0, rw = 0, last = 0, raf = 0, hidden = false;
    function frame(ts) {
      raf = 0; if (stopped) return;
      if (last && !hidden) { var d = ts - last; if (d > 0 && d < 5000) { ring[rw] = d; rw = (rw + 1) % keep; if (rn < keep) rn++; } }
      last = ts;
      raf = win.requestAnimationFrame(frame);
    }
    function framesNow() { var a = [], i, from = rn < keep ? 0 : rw; for (i = 0; i < rn; i++) a.push(ring[(from + i) % keep]); return a; }
    function onVis() { hidden = doc.visibilityState === 'hidden'; last = 0; }
    if (fr.supported && o.frames !== false && typeof win.requestAnimationFrame === 'function') { raf = win.requestAnimationFrame(frame); doc.addEventListener('visibilitychange', onVis); }

    // ---- tasks, marks, long tasks ----
    var tasks = [], marks = [], longs = [], po = null;
    function addTask(nm, ms, kind) { if (tasks.length >= 300) tasks.shift(); tasks.push({ name: String(nm), ms: ms, kind: kind || 'app', at: now() - t0 }); }
    fr.mark = function (nm) { marks.push({ name: String(nm), at: now() - t0 }); };
    fr.time = function (nm, ms) { if (typeof ms === 'number' && ms >= 0) addTask(nm, ms, 'app'); };
    fr.task = function (nm, fn) { var a = now(), r; try { r = fn(); } finally { addTask(nm, now() - a, 'app'); } return r; };
    try {
      if (typeof PerformanceObserver === 'function') {
        po = new PerformanceObserver(function (list) { var es = list.getEntries(), i; for (i = 0; i < es.length; i++) { if (longs.length >= 300) longs.shift(); longs.push({ ms: es[i].duration, at: es[i].startTime }); } });
        po.observe({ type: 'longtask', buffered: true });
      }
    } catch (e) { po = null; }

    // ---- errors ----
    var errs = [], dropped = 0, undoConsole = [];
    function addErr(kind, text, stack) {
      var at = now() - t0, i;
      text = String(text);
      for (i = errs.length - 1; i >= 0 && i >= errs.length - 6; i--) if (errs[i].kind === kind && errs[i].text === text) { errs[i].count++; return; }
      if (errs.length >= maxErrs) { errs.shift(); dropped++; }
      errs.push({ kind: kind, text: text, stack: stack ? String(stack) : '', count: 1, at: at });
    }
    function onError(ev) {
      var t = ev && ev.target;
      if (t && t !== win && t.tagName) { addErr('failed to load', '<' + String(t.tagName).toLowerCase() + '> ' + (t.currentSrc || t.src || t.href || ''), ''); return; }
      var er = ev && ev.error;
      addErr('error', (er && er.message ? er.name + ': ' + er.message : (ev && ev.message) || 'error') + (ev && ev.filename ? ' (' + String(ev.filename).split('/').pop() + ':' + ev.lineno + ':' + ev.colno + ')' : ''), er && er.stack);
    }
    function onRej(ev) { var r = ev && ev.reason; addErr('promise rejected', r && r.message ? (r.name || 'Error') + ': ' + r.message : String(r), r && r.stack); }
    function onCsp(ev) { addErr('page policy block', (ev.violatedDirective || ev.effectiveDirective || '') + ' blocked ' + (ev.blockedURI || 'something'), ''); }
    if (fr.supported) {
      win.addEventListener('error', onError, true);
      win.addEventListener('unhandledrejection', onRej);
      doc.addEventListener('securitypolicyviolation', onCsp);
      if (o.console !== false && typeof console === 'object' && console) {
        ['error', 'warn'].forEach(function (lv) {
          var orig = console[lv]; if (typeof orig !== 'function') return;
          console[lv] = function () {
            try { addErr('console.' + lv, Array.prototype.map.call(arguments, function (a) { return a && a.message ? a.message : typeof a === 'object' ? safeJson(a) : String(a); }).join(' '), ''); } catch (e) { /* never break the page's own logging */ }
            return orig.apply(this, arguments);
          };
          undoConsole.push(function () { if (console[lv] !== orig) console[lv] = orig; });
        });
      }
    }
    function safeJson(a) { try { return JSON.stringify(a); } catch (e) { return String(a); } }

    // ---- reports ----
    function deviceLines() {
      var n = typeof navigator === 'object' && navigator ? navigator : {}, sc = win && win.screen ? win.screen : {};
      return ['- Browser: ' + one(n.userAgent || 'not available'),
        '- Cores: ' + (n.hardwareConcurrency || 'not available') + ', memory class: ' + (n.deviceMemory ? n.deviceMemory + ' GB (rounded down by the browser)' : 'not available'),
        '- Screen: ' + (sc.width || '?') + ' x ' + (sc.height || '?') + ', window: ' + (win ? win.innerWidth + ' x ' + win.innerHeight : '?') + ', pixel ratio: ' + (win && win.devicePixelRatio || '?'),
        '- WebAssembly: ' + (typeof WebAssembly === 'object' ? 'yes' : 'no') + ', Worker: ' + (typeof Worker === 'function' ? 'yes' : 'no')];
    }
    function head(title) {
      return ['# ' + title, '', 'Page: ' + name + (version ? ' ' + version : '') + ' · field-report ' + VERSION + ' · saved ' + new Date().toISOString() + ' · ' + r1((now() - t0) / 1000) + ' s after the page started', '', '## Device', ''].concat(deviceLines(), ['']);
    }
    function startup() {
      var out = { dcl: 0, load: 0, paint: 0 }, nav, p;
      try {
        nav = perf.getEntriesByType('navigation')[0];
        if (nav) { out.dcl = nav.domContentLoadedEventEnd; out.load = nav.loadEventEnd; }
        p = perf.getEntriesByName('first-contentful-paint')[0] || perf.getEntriesByName('first-paint')[0];
        if (p) out.paint = p.startTime;
      } catch (e) { /* older browsers: leave the zeros */ }
      return out;
    }
    fr.speed = function () {
      var st = frameStats(framesNow()), su = startup(), all = tasks.concat(longs.map(function (l) { return { name: 'long task (browser report)', ms: l.ms, kind: 'browser', at: l.at }; }));
      return { stats: st, startup: su, marks: marks.slice(), tasks: all, verdict: speedVerdict(st, all, su.paint, target) };
    };
    fr.speedText = function () {
      var s = fr.speed(), st = s.stats, o2 = head('Speed report'), i, t;
      o2.push('## Verdict', '', s.verdict.text, '', '## Start-up (ms, lower is better)', '');
      o2.push('| Step | ms |', '|---|---:|', '| First paint | ' + (s.startup.paint ? r1(s.startup.paint) : 'not reported') + ' |', '| DOMContentLoaded | ' + (s.startup.dcl ? r1(s.startup.dcl) : 'not reported') + ' |', '| Page load | ' + (s.startup.load ? r1(s.startup.load) : 'not reported') + ' |');
      for (i = 0; i < s.marks.length; i++) o2.push('| ' + one(s.marks[i].name) + ' | ' + r1(s.marks[i].at) + ' |');
      o2.push('', '## Frames', '');
      if (!st.frames) o2.push('No frames were recorded.', '');
      else {
        o2.push('| What | Value |', '|---|---:|', '| Frames recorded | ' + st.frames + ' |', '| Average (FPS, higher is better) | ' + r1(st.fps) + ' |', '| Slowest 1% of frames (FPS, higher is better) | ' + r1(st.low1) + ' |',
          '| Slowest five frames (ms, lower is better) | ' + st.slowest.map(r1).join(', ') + ' |', '| Frames over 33 ms / 50 ms / 100 ms | ' + st.over33 + ' / ' + st.over50 + ' / ' + st.over100 + ' |', '');
      }
      o2.push('## Heavy tasks (ms, lower is better)', '');
      if (!s.tasks.length) o2.push('None recorded' + (po ? '.' : ' (this browser does not report long tasks; use task() or time() around known heavy jobs).'), '');
      else {
        var sorted = s.tasks.slice().sort(function (a, b) { return b.ms - a.ms; }).slice(0, 15);
        o2.push('| Task | ms | Seconds in |', '|---|---:|---:|');
        for (i = 0; i < sorted.length; i++) { t = sorted[i]; o2.push('| ' + one(t.name) + ' | ' + r1(t.ms) + ' | ' + r1(t.at / 1000) + ' |'); }
        o2.push('');
      }
      return o2.join('\n');
    };
    fr.errorsText = function () { return errorsMarkdown(head('Error log'), errs.map(function (e) { return e; }), dropped); };
    fr.errors = function () { return errs.map(function (e) { return { kind: e.kind, text: e.text, count: e.count, at: e.at }; }); };

    // ---- saving ----
    function save(kind) {
      var text = kind === 'speed' ? fr.speedText() : fr.errorsText(), file = name + '-' + (kind === 'speed' ? 'speed' : 'errors') + '-' + stamp(new Date()) + '.md';
      if (typeof o.onSave === 'function') { try { o.onSave(text, file, kind); } catch (e) { /* the page's own handler failed; the file is not lost, it is returned below */ } return { text: text, file: file, saved: 'handler' }; }
      var done = false;
      try {
        if (typeof Blob === 'function' && typeof URL === 'function' && URL.createObjectURL) {
          var url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' })), a = doc.createElement('a');
          a.href = url; a.download = file; a.style.display = 'none'; doc.body.appendChild(a); a.click();
          setTimeout(function () { try { doc.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) { /* already gone */ } }, 1500);
          done = true;
        }
      } catch (e) { done = false; }
      if (!done) showText(text);
      return { text: text, file: file, saved: done ? 'download' : 'shown' };
    }
    fr.saveSpeed = function () { return save('speed'); };
    fr.saveErrors = function () { return save('errors'); };

    // ---- the hidden panel ----
    var panel = null, status = null;
    function el(tag, css, text) { var e = doc.createElement(tag), k; for (k in css) if (Object.prototype.hasOwnProperty.call(css, k)) e.style[k] = css[k]; if (text != null) e.textContent = text; return e; }
    function showText(text) {
      if (!panel) fr.open();
      var ta = el('textarea', { width: '100%', height: '40vh', marginTop: '10px', font: '12px monospace', boxSizing: 'border-box' });
      ta.readOnly = true; ta.value = text; panel.firstChild.appendChild(ta);
      if (status) status.textContent = 'This browser would not save a file here. Copy the text below instead.';
    }
    function button(label, fn) {
      var b = el('button', { display: 'block', width: '100%', minHeight: '48px', margin: '8px 0', font: '16px system-ui, sans-serif', borderRadius: '10px', border: '1px solid #888', background: '#2a2f3a', color: '#fff', cursor: 'pointer' }, label);
      b.type = 'button'; b.addEventListener('click', fn); return b;
    }
    fr.open = function () {
      if (panel || !fr.supported) return;
      panel = el('div', { position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', zIndex: '2147483646', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' });
      panel.setAttribute('data-field-report', 'panel');
      var card = el('div', { background: '#161a22', color: '#fff', padding: '16px', borderRadius: '14px', width: '100%', maxWidth: '360px', maxHeight: '90vh', overflow: 'auto', font: '15px system-ui, sans-serif', boxSizing: 'border-box' });
      card.appendChild(el('div', { fontWeight: '600', marginBottom: '6px' }, 'Report for ' + name + (version ? ' ' + version : '')));
      var sp = button('Save speed report', function () { var r = fr.saveSpeed(); setStatus(r.saved === 'shown' ? '' : 'Saved ' + r.file); });
      var er = button('Save error log', function () { var r = fr.saveErrors(); setStatus(r.saved === 'shown' ? '' : 'Saved ' + r.file); });
      var cl = button('Close', function () { fr.close(); });
      sp.setAttribute('data-field-report', 'speed'); er.setAttribute('data-field-report', 'errors'); cl.setAttribute('data-field-report', 'close');
      status = el('div', { minHeight: '20px', fontSize: '13px', opacity: '0.8', wordBreak: 'break-all' }, 'Nothing leaves this device.');
      card.appendChild(sp); card.appendChild(er); card.appendChild(status); card.appendChild(cl);
      panel.appendChild(card); doc.body.appendChild(panel);
      if (typeof o.onOpen === 'function') { try { o.onOpen(); } catch (e) { /* page callback */ } }
    };
    function setStatus(t) { if (status && t) status.textContent = t; }
    fr.close = function () {
      if (!panel) return;
      try { doc.body.removeChild(panel); } catch (e) { /* already gone */ }
      panel = null; status = null;
      if (typeof o.onClose === 'function') { try { o.onClose(); } catch (e) { /* page callback */ } }
    };
    fr.isOpen = function () { return !!panel; };

    // ---- the hidden tap spot: counted from the page's own pointer events, nothing is drawn over the page ----
    var hits = [];
    function inSpot(x, y) {
      var w = win.innerWidth, h = win.innerHeight, left = corner.indexOf('left') >= 0, top = corner.indexOf('top') >= 0;
      return (left ? x <= size : x >= w - size) && (top ? y <= size : y >= h - size);
    }
    function onDown(ev) {
      if (panel || !ev) return;
      if (!inSpot(ev.clientX, ev.clientY)) { hits.length = 0; return; }
      var t = now(); hits.push(t);
      while (hits.length && t - hits[0] > within) hits.shift();
      if (hits.length >= needTaps) { hits.length = 0; fr.open(); }
    }
    if (fr.supported) win.addEventListener('pointerdown', onDown, true);

    fr.stop = function () {
      if (stopped) return; stopped = true;
      if (raf && win.cancelAnimationFrame) win.cancelAnimationFrame(raf);
      if (fr.supported) {
        doc.removeEventListener('visibilitychange', onVis); win.removeEventListener('error', onError, true); win.removeEventListener('unhandledrejection', onRej);
        doc.removeEventListener('securitypolicyviolation', onCsp); win.removeEventListener('pointerdown', onDown, true);
      }
      undoConsole.forEach(function (u) { u(); }); undoConsole = [];
      if (po) { try { po.disconnect(); } catch (e) { /* not observing */ } }
      fr.close();
    };
    return fr;
  }

  return { version: VERSION, start: start, frameStats: frameStats, speedVerdict: speedVerdict, errorsMarkdown: errorsMarkdown };
});
