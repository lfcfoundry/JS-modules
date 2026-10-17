/*!
 * test-isolation.js: keep a test page away from the player's real saved game. No dependencies.
 * Replaces localStorage (and, if you ask, sessionStorage) with a copy that puts a prefix in front of every key, so a test page, a
 * speed test or a fuzz run never reads or overwrites the real keys, and its own keys never mix with them. Browser or Node.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.1.0 (API 1)
 *
 *   TestIsolation.install({ prefix: "speedtest:" });                 // first thing on the page, before the game's own script
 *   TestIsolation.install({ prefix: "speedtest:", fresh: true });    // also removes keys left behind by an earlier run
 *   TestIsolation.install({ prefix: "speedtest:", seed: true });     // also starts the test copy with the real save's values (the real keys stay untouched)
 *   var inline = TestIsolation.snippet("speedtest:");                // the same thing as one line of text, to paste at the top of <head>
 *   var fake = TestIsolation.wrap(realStorage, "t1:");               // a Storage-like object over any Storage (also used in Node tests)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TestIsolation = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // One self-contained function (it uses no names from outside): wrap() calls it and snippet() prints its text, so the two can never drift apart.
  function build(real, P, win) {
    var cache = null, count = -1, m;
    function list() {
      if (cache === null || count !== real.length) {
        var a = [], i, k; for (i = 0; i < real.length; i++) { k = real.key(i); if (k !== null && k.indexOf(P) === 0) a.push(k); }
        cache = a; count = real.length;
      }
      return cache;
    }
    function drop() { cache = null; }
    if (win && win.addEventListener) win.addEventListener('storage', drop);
    m = {
      getItem: function (k) { return real.getItem(P + k); },
      setItem: function (k, v) { real.setItem(P + k, String(v)); drop(); },
      removeItem: function (k) { real.removeItem(P + k); drop(); },
      clear: function () { list().slice().forEach(function (k) { real.removeItem(k); }); drop(); },
      key: function (i) { var a = list(); return i >= 0 && i < a.length ? a[i].slice(P.length) : null; }
    };
    if (typeof Proxy === 'undefined') {
      var s = {};
      Object.keys(m).forEach(function (n) { Object.defineProperty(s, n, { value: m[n] }); });
      Object.defineProperty(s, 'length', { get: function () { return list().length; } });
      return s;
    }
    return new Proxy({}, {
      get: function (t, k) { if (k === 'length') return list().length; if (typeof k === 'symbol') return undefined; if (m.hasOwnProperty(k)) return m[k]; var v = real.getItem(P + k); return v === null ? undefined : v; },
      set: function (t, k, v) { m.setItem(k, v); return true; },
      has: function (t, k) { return typeof k === 'string' && (m.hasOwnProperty(k) || real.getItem(P + k) !== null); },
      deleteProperty: function (t, k) { m.removeItem(k); return true; },
      ownKeys: function () { return list().map(function (k) { return k.slice(P.length); }); },
      getOwnPropertyDescriptor: function (t, k) { var v = real.getItem(P + k); return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true }; }
    });
  }

  /** A Storage-like object over `real`: getItem, setItem, removeItem, clear (only its own keys), key, length; also property-style reads and writes, `in`, delete and Object.keys. */
  function wrap(real, prefix) {
    prefix = String(prefix === undefined ? 'test:' : prefix);
    if (!prefix) throw new Error('The prefix cannot be empty: an empty prefix would not keep the keys apart.');
    return build(real, prefix, typeof window !== 'undefined' ? window : null);
  }

  /**
   * Swaps the page's storage for a prefixed one. opts: { prefix: "test:", names: ["localStorage"], target: window, fresh: false, seed: false }.
   * fresh: remove the keys an earlier run left under this prefix first. seed: copy the real keys' values into the test copy first (the real keys are only read).
   * Returns { ok, prefix, names, restore() }. When the browser will not give the page storage at all (some privacy settings), ok is false and nothing changes.
   */
  function install(opts) {
    opts = opts || {};
    var target = opts.target || (typeof window !== 'undefined' ? window : null), prefix = opts.prefix === undefined ? 'test:' : String(opts.prefix);
    var names = opts.names || ['localStorage'], done = [], originals = {}, i;
    if (!prefix) throw new Error('The prefix cannot be empty: an empty prefix would not keep the keys apart.');
    if (!target) return { ok: false, prefix: prefix, reason: 'There is no page to install into.', restore: function () {} };
    for (i = 0; i < names.length; i++) {
      var name = names[i], real, s, j, k, keep;
      try { real = target[name]; if (!real) throw new Error('missing'); real.length; } catch (e) { continue; }
      originals[name] = { own: Object.getOwnPropertyDescriptor(target, name) };
      s = build(real, prefix, target);
      if (opts.fresh) s.clear();
      if (opts.seed) { keep = []; for (j = 0; j < real.length; j++) { k = real.key(j); if (k !== null && k.indexOf(prefix) !== 0) keep.push(k); } keep.forEach(function (key) { s.setItem(key, real.getItem(key)); }); }
      Object.defineProperty(target, name, { value: s, configurable: true });
      done.push(name);
    }
    return {
      ok: done.length > 0, prefix: prefix, names: done,
      reason: done.length ? '' : 'The browser would not give this page storage, so nothing was replaced.',
      restore: function () { done.forEach(function (n) { if (originals[n].own) Object.defineProperty(target, n, originals[n].own); else delete target[n]; }); done = []; }
    };
  }

  /** The same thing as a short piece of script text for a test page builder to paste first in <head>. Shows no errors if storage is blocked. */
  function snippet(prefix, names) {
    return '(function(){var B=' + build.toString().replace(/\s*\n\s*/g, ' ') + ',P=' + JSON.stringify(String(prefix === undefined ? 'test:' : prefix)) + ';' + JSON.stringify(names || ['localStorage']) +
      '.forEach(function(n){try{var r=window[n];r.length;Object.defineProperty(window,n,{value:B(r,P,window),configurable:true})}catch(e){}})})();';
  }

  return { install: install, wrap: wrap, snippet: snippet };
}));
