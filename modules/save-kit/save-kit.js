/*!
 * save-kit.js: safe localStorage saves, a rolling backup slot, and checksummed copy-paste save codes.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 * What it gives you
 *  - validate(): rebuilds a state object from untrusted data using a field schema. Every field falls back on its own, so one
 *    damaged number never costs the rest of the save. Prototype-pollution keys are dropped. Counts are capped.
 *  - save(): refuses to write when a number is NaN/Infinity/negative (a bug must never overwrite good progress),
 *    stamps `seen`, and copies the last good save to a backup slot at most once a minute.
 *  - load(): reads the main slot, or the backup slot if the main one is unreadable.
 *  - exportCode()/importCode(): 'AB1z.<base64url>.<7-char check>' codes (deflate-raw squeezed where the browser can). The check
 *    catches a code that was cut off while copying.
 *  - autosave(): timer + pagehide + visibilitychange, because phones close hidden pages without warning.
 *  - twoTap(): "tap again to confirm" helper for destructive buttons (pop-up confirm() is often unavailable).
 *
 * Schema types (strings): 'num' finite >= 0 | 'int' whole >= 0 | 'flag' 0 or 1 | 'str:N' string up to N chars |
 *   'int:N' whole 0..N | 'counts' map of name -> whole number (>0, capped at 1e6, or {counts:{max:N}} via object form) |
 *   { type:'counts', max:20 } | { type:'int', max:99 } | { type:'str', max:20 } | { type:'raw' } (kept as-is if JSON-plain, use sparingly)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SaveKit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
  function bag() { return Object.create(null); }
  function isNum(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }

  function norm(spec) {
    if (typeof spec === 'object') return spec;
    var m = /^(\w+)(?::(\d+))?$/.exec(spec) || [];
    return { type: m[1] || 'raw', max: m[2] ? +m[2] : undefined };
  }

  // Rebuilds one field's value from untrusted data; `d` is the default used when the value is missing or broken.
  function cleanField(spec, v, d) {
    spec = norm(spec);
    switch (spec.type) {
      case 'num': return isNum(v) ? v : d;
      case 'int': return isNum(v) ? Math.min(Math.floor(v), spec.max == null ? Number.MAX_SAFE_INTEGER : spec.max) : d;
      case 'flag': return v === 1 ? 1 : 0;
      case 'str': return typeof v === 'string' && v.length <= (spec.max || 200) ? v : (d == null ? '' : d);
      case 'counts':
        var out = bag();
        if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
        Object.keys(v).forEach(function (k) {
          if (BAD_KEYS[k] || k.length > 200) return;
          var n = v[k];
          if (typeof n === 'number' && isFinite(n) && n > 0) out[k] = Math.min(Math.floor(n), spec.max || 1e6);
        });
        return out;
      case 'raw': try { return JSON.parse(JSON.stringify(v)); } catch (e) { return d; }
      default: return d;
    }
  }

  // validate(schema, defaults, untrusted) -> a new, clean state object. Fields not in the schema are dropped.
  function validate(schema, defaults, input) {
    var out = {};
    input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    Object.keys(schema).forEach(function (k) {
      out[k] = cleanField(schema[k], input[k], defaults ? defaults[k] : undefined);
    });
    return out;
  }

  // isSound(state, keys): true when every listed numeric field that is present is a sound number.
  function isSound(state, keys) {
    return keys.every(function (k) { var v = state[k]; return v === undefined || isNum(v); });
  }

  // ---- codes ----
  function checksum(t) {   // FNV-1a, 32 bit, base 36
    var h = 0x811c9dc5;
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(36)).slice(-7);   // always 7 characters, so words pasted after a code are not swallowed
  }
  function toB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64(t) {
    var bin = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function canSqueeze() {
    try { new CompressionStream('deflate-raw'); new DecompressionStream('deflate-raw'); return true; } catch (e) { return false; }
  }
  function squeeze(bytes, how) {
    var cs = how === 'in' ? new DecompressionStream('deflate-raw') : new CompressionStream('deflate-raw');
    var out = new Blob([bytes]).stream().pipeThrough(cs);
    return new Response(out).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  // ---- the store ----
  // create({ key, schema, defaults, soundKeys, prefix, storage })
  //   key: localStorage key. schema/defaults: see validate(). soundKeys: numeric fields that must be sound to write a save
  //   (default: every 'num'/'int' field). prefix: 2 capital letters + digit for codes, default 'SK1'.
  function create(o) {
    var key = o.key, schema = o.schema, defaults = o.defaults || {}, prefix = o.prefix || 'SK1';
    var storage = o.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var soundKeys = o.soundKeys || Object.keys(schema).filter(function (k) { var t = norm(schema[k]).type; return t === 'num' || t === 'int'; });
    var off = false, backupAt = 0, backupEvery = o.backupEveryMs == null ? 60000 : o.backupEveryMs;

    function readSlot(slot) {
      try {
        var x = JSON.parse(storage.getItem(slot) || 'null');
        if (x && typeof x === 'object' && !Array.isArray(x) && isSound(x, soundKeys)) return x;
      } catch (e) {}
      return null;
    }
    var api = {
      validate: function (input) { return validate(schema, defaults, input); },
      // Returns a clean state from the main slot, else the backup slot, else null.
      load: function () {
        var s = readSlot(key) || readSlot(key + '-backup');
        return s ? validate(schema, defaults, s) : null;
      },
      // Writes the state. Returns false (and writes nothing) if a number is broken, saving is switched off, or storage fails.
      save: function (state) {
        if (off || !storage || !isSound(state, soundKeys)) return false;
        state.seen = Date.now();
        try {
          var txt = JSON.stringify(state);
          storage.setItem(key, txt);
          if (Date.now() - backupAt > backupEvery) { storage.setItem(key + '-backup', txt); backupAt = Date.now(); }
          return true;
        } catch (e) { return false; }
      },
      forceBackupNext: function () { backupAt = 0; },
      // Switches saving off (true) or on (false). Used while a loaded save waits for a page reload, so the old game can't overwrite it.
      pause: function (v) { off = v !== false; },
      // Calls getState() and saves: every `every` ms, on pagehide, and when the page is hidden.
      autosave: function (getState, every) {
        var tick = function () { api.save(getState()); };
        var iv = setInterval(tick, every || 2000);
        function onHide() { if (typeof document !== 'undefined' && document.hidden) { api.forceBackupNext(); tick(); } }
        if (typeof window !== 'undefined') { window.addEventListener('pagehide', tick); document.addEventListener('visibilitychange', onHide); }
        return function stop() { clearInterval(iv); if (typeof window !== 'undefined') { window.removeEventListener('pagehide', tick); document.removeEventListener('visibilitychange', onHide); } };
      },
      // -> Promise<string> like 'SK1z.<data>.<check>' (z = squeezed, p = plain)
      exportCode: function (state) {
        state.seen = Date.now();
        var raw = new TextEncoder().encode(JSON.stringify(state));
        var done = function (flag, bytes) { var d = toB64(bytes); return prefix + flag + '.' + d + '.' + checksum(d); };
        if (!canSqueeze()) return Promise.resolve(done('p', raw));
        return squeeze(raw, 'out').then(function (b) { return done('z', b); }, function () { return done('p', raw); });
      },
      // -> Promise<clean state>; rejects with a short human-readable message (string).
      importCode: function (text) {
        var re = new RegExp(prefix + '([zp])\\.([A-Za-z0-9_-]+)\\.([0-9a-z]{7})');
        var flat = String(text || '').replace(/\s+/g, '');
        var m = re.exec(flat);
        if (!m) return Promise.reject(flat.indexOf(prefix) >= 0 ? 'That code is not complete. Copy the whole code and try again.' : 'That is not a save code for this game.');
        if (checksum(m[2]) !== m[3]) return Promise.reject('That code is not complete. Copy the whole code and try again.');
        var bytes;
        try { bytes = fromB64(m[2]); } catch (e) { return Promise.reject('That code is damaged.'); }
        var get = m[1] === 'z' ? (canSqueeze() ? squeeze(bytes, 'in') : Promise.reject('This browser cannot open that code. Try a newer browser.')) : Promise.resolve(bytes);
        return get.then(function (b) {
          var x = JSON.parse(new TextDecoder().decode(b));
          if (!x || typeof x !== 'object' || Array.isArray(x) || !isSound(x, soundKeys)) throw 0;
          return validate(schema, defaults, x);
        }).catch(function (e) { throw typeof e === 'string' ? e : 'That code is damaged.'; });
      },
      // Stores an imported state for the next page load: keeps the current game in `<key>-before-load`, pauses saving.
      // Call location.reload() afterwards. Returns false if storage refused.
      stageImport: function (imported, currentState) {
        try {
          imported.seen = Date.now();
          if (currentState) storage.setItem(key + '-before-load', JSON.stringify(currentState));
          off = true;
          storage.setItem(key, JSON.stringify(imported));
          storage.setItem(key + '-backup', JSON.stringify(imported));
          return true;
        } catch (e) { off = false; return false; }
      }
    };
    return api;
  }

  // twoTap(fn, ms, onArm, onDisarm) -> a click handler: the first call arms (and calls onArm), a second call within ms runs fn.
  function twoTap(fn, ms, onArm, onDisarm) {
    var armed = null;
    return function () {
      if (!armed) { armed = setTimeout(function () { armed = null; if (onDisarm) onDisarm(); }, ms || 3000); if (onArm) onArm(); return false; }
      clearTimeout(armed); armed = null; if (onDisarm) onDisarm();
      fn.apply(this, arguments); return true;
    };
  }

  return { create: create, validate: validate, isSound: isSound, checksum: checksum, toBase64Url: toB64, fromBase64Url: fromB64, twoTap: twoTap, bag: bag };
});
