/*!
 * slow-note.js: a short note, kept only on this device, of the slow and broken moments a page lived through. No dependencies.
 * Listens for events only (errors, rejected promises, taps the browser calls slow, long frames), so it costs nothing while the page is smooth.
 * The last few notes are kept in localStorage and can be copied as plain text to paste into a message. Nothing is sent anywhere.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   var note = SlowNote.start({ key: "mygame-log", context: function () { return " [level " + level + "]"; }, header: "My game 1.4" });
 *   note.count();            // how many moments are noted
 *   note.text();             // the whole note as plain text: header, start-up times, one line per moment
 *   note.copy().then(function (ok) { ... });   // to the clipboard, true when it worked
 *   note.clear();            // forget them all
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlowNote = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * The note itself, with no page needed (this is what the Node tests drive).
   * opts: { key (storage key; none = keep in memory only), storage (default localStorage), max (30), quietMs (4000: nothing is noted this soon after load),
   *         perKindMs (1000: one note of each kind per this long), saveMs (4000: writes to storage are at most this often), now() and later(fn, ms) for tests }
   */
  function createLog(opts) {
    opts = opts || {};
    var max = opts.max > 0 ? Math.floor(opts.max) : 30, quietMs = opts.quietMs === undefined ? 4000 : opts.quietMs, perKind = opts.perKindMs === undefined ? 1000 : opts.perKindMs, saveMs = opts.saveMs === undefined ? 4000 : opts.saveMs;
    var wall = opts.wall || function () { return Date.now(); }, since = opts.since || function () { return typeof performance !== 'undefined' ? performance.now() : 0; };
    var later = opts.later || function (fn, ms) { return setTimeout(fn, ms); }, stop = opts.stop || clearTimeout;
    var store = opts.storage !== undefined ? opts.storage : (function () { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } })();
    var key = opts.key || '', log = [], lastAt = {}, timer = null, listeners = [];
    if (key && store) {
      try {
        var raw = JSON.parse(store.getItem(key) || '[]');
        if (Array.isArray(raw)) log = raw.filter(function (e) { return Array.isArray(e) && e.length === 3 && typeof e[0] === 'number' && typeof e[1] === 'string' && typeof e[2] === 'string'; }).slice(-max);
      } catch (e) { /* a damaged note starts over */ }
    }
    function persist() {
      timer = null;
      if (!key || !store) return true;
      try { store.setItem(key, JSON.stringify(log)); return true; } catch (e) { return false; }
    }
    function changed() { listeners.forEach(function (f) { try { f(log.length); } catch (e) { /* the page's callback must not break the note */ } }); }
    var self = {
      /** Notes one moment. Returns false when it was left out (too early after load, or too soon after one of the same kind). */
      add: function (kind, text, extra) {
        if (since() < quietMs) return false;
        var t = wall();
        if (lastAt[kind] !== undefined && t - lastAt[kind] < perKind) return false;
        lastAt[kind] = t;
        log.push([t, String(kind), String(text).slice(0, 220) + (extra || '')]);
        if (log.length > max) log.shift();
        if (!timer && key && store) timer = later(persist, saveMs);
        changed();
        return true;
      },
      entries: function () { return log.map(function (e) { return e.slice(); }); },
      count: function () { return log.length; },
      onChange: function (f) { if (typeof f === 'function') listeners.push(f); },
      /** Writes to storage now (call when the page is hidden or closing). */
      flush: function () { if (timer) { stop(timer); } return persist(); },
      clear: function () { log = []; lastAt = {}; if (timer) stop(timer); persist(); changed(); }
    };
    return self;
  }

  var r0 = function (n) { return Math.round(n); };
  function tagOf(el) { try { return el && el.tagName ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') : '?'; } catch (e) { return '?'; } }
  var ms = function (v) { return typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v) + ' ms' : '?'; };

  /** The start-up timeline in plain words: when the page was parsed, your own marks (milliseconds since load, e.g. { 'the game script began': 120 }), first paint, finish. */
  function startupWords(marks) {
    try {
      var nav = (performance.getEntriesByType('navigation')[0]) || {}, pt = {}, parts = [];
      performance.getEntriesByType('paint').forEach(function (e) { pt[e.name] = e.startTime; });
      parts.push('the page was parsed by ' + ms(nav.domContentLoadedEventEnd));
      Object.keys(marks || {}).forEach(function (k) { parts.push(k + ' at ' + ms(marks[k])); });
      parts.push('the browser reports first paint at ' + ms(pt['first-paint']) + ' and first content at ' + ms(pt['first-contentful-paint']), 'everything finished loading at ' + ms(nav.loadEventEnd));
      return 'Start-up: ' + parts.join(', ') + '.';
    } catch (e) { return 'Start-up: not available in this browser.'; }
  }

  /**
   * Starts watching the page. opts (all optional): the createLog options, plus
   *   tapMs (104: a tap this slow is noted), frameMs (100: a frame this slow is noted; Chromium only), context() (text added to every note, such as the game's level),
   *   header (text at the top of the report), marks (an object, or a function returning one, for the start-up line).
   * Returns { count, entries, text, copy, clear, flush, onChange, stop, supports }. supports says which kinds this browser can see.
   */
  function start(opts) {
    opts = opts || {};
    var log = createLog(opts), tapMs = opts.tapMs || 104, frameMs = opts.frameMs || 100, observers = [], off = [], sup = { error: true, 'slow tap': false, 'slow frame': false };
    var ctx = function () { try { return typeof opts.context === 'function' ? String(opts.context() || '') : ''; } catch (e) { return ''; } };
    function on(target, type, fn, o) { target.addEventListener(type, fn, o); off.push(function () { target.removeEventListener(type, fn, o); }); }
    if (typeof addEventListener === 'function') {
      on(window, 'error', function (e) { log.add('error', (e.message || 'error') + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0), ctx()); });
      on(window, 'unhandledrejection', function (e) { log.add('error', 'promise: ' + String((e.reason && e.reason.message) || e.reason), ctx()); });
    }
    function watch(type, o, handle) {
      try {
        if (PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.indexOf(type) < 0) return false;   // (observe() does not throw for a type the browser lacks)
        var po = new PerformanceObserver(function (l) { l.getEntries().forEach(handle); });
        po.observe(Object.assign({ type: type }, o)); observers.push(po); return true;
      } catch (e) { return false; }
    }
    sup['slow tap'] = watch('event', { durationThreshold: tapMs }, function (e) {
      if (e.duration >= tapMs) log.add('slow tap', e.name + ' took ' + r0(e.duration) + ' ms (waited ' + r0(e.processingStart - e.startTime) + ', ran ' + r0(e.processingEnd - e.processingStart) + ') on ' + tagOf(e.target), ctx());
    });
    sup['slow frame'] = watch('long-animation-frame', {}, function (e) {
      if (e.duration >= frameMs) log.add('slow frame', 'a frame took ' + r0(e.duration) + ' ms (blocked ' + r0(e.blockingDuration || 0) + ' ms)', ctx());
    });
    if (typeof document !== 'undefined') on(document, 'visibilitychange', function () { if (document.hidden) log.flush(); });
    if (typeof addEventListener === 'function') on(window, 'pagehide', function () { log.flush(); });
    function text() {
      var head = (opts.header || 'Slow-moment note') + ' | ' + (typeof navigator !== 'undefined' ? navigator.userAgent : '?') + ' | ' + (typeof innerWidth !== 'undefined' ? innerWidth + 'x' + innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x' : '?') + ' | ' + new Date().toLocaleString();
      var marks = typeof opts.marks === 'function' ? opts.marks() : opts.marks, e = log.entries();
      return head + '\n' + startupWords(marks) + '\n' + (e.length ? e.map(function (x) { return new Date(x[0]).toLocaleString() + ' | ' + x[1] + ' | ' + x[2]; }).join('\n') : 'Nothing noted.');
    }
    function copy() {
      var txt = text();
      function fallback() {
        try {
          var a = document.createElement('textarea'); a.value = txt; a.setAttribute('readonly', ''); a.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
          document.body.appendChild(a); a.select(); var ok = document.execCommand('copy'); document.body.removeChild(a); return ok;
        } catch (e) { return false; }
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt).then(function () { return true; }, function () { return fallback(); });
      return Promise.resolve(fallback());
    }
    return {
      count: log.count, entries: log.entries, onChange: log.onChange, clear: log.clear, flush: log.flush, text: text, copy: copy, supports: sup, add: log.add,
      stop: function () { observers.forEach(function (o) { try { o.disconnect(); } catch (e) { /* already gone */ } }); off.forEach(function (f) { f(); }); log.flush(); observers = []; off = []; }
    };
  }

  return { start: start, createLog: createLog, startupWords: startupWords };
}));
