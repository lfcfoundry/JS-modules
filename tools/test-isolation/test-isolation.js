/*!
 * test-isolation.js: keep a test page away from the player's real saved game. No dependencies.
 * Replaces localStorage (and, if you ask, sessionStorage) with a copy that puts a prefix in front of every key, so a test page, a
 * speed test or a fuzz run never reads or overwrites the real keys, and its own keys never mix with them. Browser or Node.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   TestIsolation.install({ prefix: "speedtest:" });                 // first thing on the page, before the game's own script
 *   var inline = TestIsolation.snippet("speedtest:");                // the same thing as one line of text, to paste at the top of <head>
 *   var fake = TestIsolation.wrap(realStorage, "t1:");               // a Storage-like object over any Storage (also used in Node tests)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TestIsolation = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** A Storage-like object over `real`: getItem, setItem, removeItem, clear (only its own keys), key, length. */
  function wrap(real, prefix) {
    prefix = String(prefix === undefined ? 'test:' : prefix);
    if (!prefix) throw new Error('The prefix cannot be empty: an empty prefix would not keep the keys apart.');
    function own() {
      var out = [], i, k;
      for (i = 0; i < real.length; i++) { k = real.key(i); if (k !== null && k.indexOf(prefix) === 0) out.push(k); }
      return out;
    }
    var sh = {
      getItem: function (k) { return real.getItem(prefix + k); },
      setItem: function (k, v) { real.setItem(prefix + k, String(v)); },
      removeItem: function (k) { real.removeItem(prefix + k); },
      clear: function () { own().forEach(function (k) { real.removeItem(k); }); },
      key: function (i) { var a = own(); return i >= 0 && i < a.length ? a[i].slice(prefix.length) : null; }
    };
    Object.defineProperty(sh, 'length', { get: function () { return own().length; } });
    return sh;
  }

  /**
   * Swaps the page's storage for a prefixed one. opts: { prefix: "test:", names: ["localStorage"], target: window }.
   * Returns { ok, prefix, restore() }. When the browser will not give the page storage at all (some privacy settings), ok is false and nothing changes.
   */
  function install(opts) {
    opts = opts || {};
    var target = opts.target || (typeof window !== 'undefined' ? window : null), prefix = opts.prefix === undefined ? 'test:' : String(opts.prefix);
    var names = opts.names || ['localStorage'], done = [], originals = {}, i;
    if (!target) return { ok: false, prefix: prefix, reason: 'There is no page to install into.', restore: function () {} };
    for (i = 0; i < names.length; i++) {
      var name = names[i], real;
      try { real = target[name]; if (!real) throw new Error('missing'); real.length; } catch (e) { continue; }
      originals[name] = { own: Object.getOwnPropertyDescriptor(target, name) };
      Object.defineProperty(target, name, { value: wrap(real, prefix), configurable: true });
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
    var P = JSON.stringify(String(prefix === undefined ? 'test:' : prefix)), N = JSON.stringify(names || ['localStorage']);
    return '(function(){var P=' + P + ',N=' + N + ';N.forEach(function(n){try{var r=window[n];r.length;' +
      'var o=function(){var a=[],i,k;for(i=0;i<r.length;i++){k=r.key(i);if(k!==null&&k.indexOf(P)===0)a.push(k)}return a};' +
      'var s={getItem:function(k){return r.getItem(P+k)},setItem:function(k,v){r.setItem(P+k,String(v))},removeItem:function(k){r.removeItem(P+k)},' +
      'clear:function(){o().forEach(function(k){r.removeItem(k)})},key:function(i){var a=o();return i>=0&&i<a.length?a[i].slice(P.length):null}};' +
      'Object.defineProperty(s,"length",{get:function(){return o().length}});Object.defineProperty(window,n,{value:s,configurable:true})}catch(e){}})})();';
  }

  return { install: install, wrap: wrap, snippet: snippet };
}));
