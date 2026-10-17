/*!
 * save-kit.js: safe localStorage saves, a rolling backup slot, and checksummed copy-paste save codes.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.2.1 (API 1)
 *
 * What it gives you
 *  - validate(): rebuilds a state object from untrusted data using a field schema. Every field falls back on its own, so one
 *    damaged number never costs the rest of the save. Prototype-pollution keys are dropped. Counts are capped.
 *  - save(): refuses to write when a number is NaN/Infinity/negative (a bug must never overwrite good progress),
 *    stamps `seen`, and copies the last good save to a backup slot at most once a minute. Never throws.
 *  - load(): reads the main slot and the backup slot and rebuilds the state from the better one, field by field with
 *    validate(), so one bad number costs only that number. Returns null only when neither slot holds an object.
 *  - exportCode()/importCode(): 'AB1z.<base64url>.<7-char check>' codes (deflate-raw squeezed where the browser can, and
 *    only when that is actually shorter). The check catches a code that was cut off while copying. Pasted text is refused
 *    when it is too long, and unpacking stops when the result passes a limit (see create() below).
 *  - autosave(): timer + pagehide + visibilitychange, because phones close hidden pages without warning.
 *  - twoTap(): "tap again to confirm" helper for destructive buttons (pop-up confirm() is often unavailable).
 *  - onOtherTab(cb): tells you when another tab of the same game wrote a save (so an old tab can stop overwriting a newer one).
 *  - persist(): asks the browser not to delete this site's storage when space runs low. Resolves true/false, never rejects.
 *  - Options added in 1.2.0 (all off unless given; they let a game that already has saves in the wild move to save-kit without breaking them):
 *    codeCheck ('hex8' = 8 hex characters, 'plain36' = base 36 without leading zeros, for codes written before save-kit), backupKey (name of the backup slot),
 *    damagedKey (keeps main-slot text that could not be used), readBackupWithoutMain:false (an empty main slot never brings back a leftover backup),
 *    afterValidate(clean, raw) (the game's own checks after the schema), stamp (name of the timestamp field, default 'seen').
 *    modules/save-kit/lean.py makes a smaller file without the parts a game does not use.
 *  - Options added in 1.1.0 (all off unless given): version + migrate (upgrade old saves), skipUnchangedMs (fewer storage writes),
 *    compactCodes (shorter codes: leaves out `seen` and fields equal to their default).
 *
 * Notes
 *  - `seen` (a timestamp) is stamped on every save and export, and removed again by load()/validate() unless your schema lists it.
 *  - 'counts' and 'raw' results: counts objects have NO prototype (Object.create(null)), so use SaveKit.has(obj, key) instead of
 *    obj.hasOwnProperty(key). 'raw' results are plain objects with __proto__/constructor/prototype keys removed.
 *
 * Schema types (strings): 'num' finite >= 0 | 'int' whole >= 0 | 'flag' 0 or 1 (a missing or broken value uses the default, so a
 *   new on-by-default setting stays on for returning players) | 'str:N' string up to N chars |
 *   'int:N' whole 0..N | 'counts' map of name -> whole number (>0, capped at 1e6) |
 *   { type:'counts', max:20, maxKeys:500 } (max = biggest value, maxKeys = most names kept, default 1000) |
 *   { type:'int', max:99 } | { type:'str', max:20 } | { type:'raw' } (kept as-is if JSON-plain, use sparingly)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SaveKit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
  var DEFAULT_MAX_KEYS = 1000;        // most names kept in one 'counts' field
//@begin codes
  var DEFAULT_MAX_BYTES = 262144;     // biggest unpacked save a code may hold: 256 KiB
  var TOO_BIG = 'That code is too big to open. Copy only the code and try again.';
  var DAMAGED = 'That code is damaged.';
  var INCOMPLETE = 'That code is not complete. Copy the whole code and try again.';
//@end

  function bag() { return Object.create(null); }
  function isNum(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }
  function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

  function norm(spec) {
    if (spec && typeof spec === 'object') return spec;
    var m = /^(\w+)(?::(\d+))?$/.exec(String(spec)) || [];
    return { type: m[1] || 'raw', max: m[2] ? +m[2] : undefined };
  }

//@begin raw
  // Copies JSON-plain data into fresh plain objects, leaving out __proto__/constructor/prototype keys. Throws if nested too deep.
  function scrub(v, depth) {
    if (depth > 32) throw new Error('too deep');
    if (v === null || typeof v !== 'object') return v;
    var out, i;
    if (Array.isArray(v)) { out = []; for (i = 0; i < v.length; i++) out.push(scrub(v[i], depth + 1)); return out; }
    out = {};
    Object.keys(v).forEach(function (k) { if (!BAD_KEYS[k]) out[k] = scrub(v[k], depth + 1); });
    return out;
  }
//@end

  // Rebuilds one field's value from untrusted data; `d` is the default used when the value is missing or broken.
  function cleanField(spec, v, d) {
    spec = norm(spec);
    switch (spec.type) {
      case 'num': return isNum(v) ? v : d;
      case 'int': return isNum(v) ? Math.min(Math.floor(v), spec.max == null ? Number.MAX_SAFE_INTEGER : spec.max) : d;
      case 'flag': return v === 1 ? 1 : v === 0 ? 0 : (d === 1 ? 1 : 0);
      case 'str': return typeof v === 'string' && v.length <= (spec.max || 200) ? v : (d == null ? '' : d);
      case 'counts':
        var out = bag(), kept = 0, maxKeys = spec.maxKeys > 0 ? spec.maxKeys : DEFAULT_MAX_KEYS;
        if (!isObj(v)) v = d;   // a missing or broken field starts from its default (1.0.0 always gave an empty map here)
        if (!isObj(v)) return out;
        var ks = Object.keys(v), cap = spec.max || 1e6, i, k, n;
        for (i = 0; i < ks.length; i++) {
          k = ks[i];
          if (BAD_KEYS[k] || k.length > 200 || kept >= maxKeys) continue;
          n = v[k];
          if (typeof n === 'number' && isFinite(n) && n > 0) { out[k] = Math.min(Math.floor(n), cap); kept++; }
        }
        return out;
//@begin raw
      case 'raw': try { return scrub(JSON.parse(JSON.stringify(v)), 0); } catch (e) { try { return scrub(JSON.parse(JSON.stringify(d)), 0); } catch (e2) { return d; } }   // a fresh copy of the default, never the default object itself
//@end
      default: return d;
    }
  }

  // validate(schema, defaults, untrusted) -> a new, clean state object. Fields not in the schema are dropped.
  function validate(schema, defaults, input) { return validateWith(fieldsOf(schema), defaults, input); }
  // The field rules read once: [name, normalized rule] pairs (create() keeps them, so a save or load does not parse the rules again).
  function fieldsOf(schema) {
    var ks = Object.keys(schema), f = [], i;
    for (i = 0; i < ks.length; i++) f.push([ks[i], norm(schema[ks[i]])]);
    return f;
  }
  function validateWith(fields, defaults, input) {
    var out = {}, i, k;
    input = isObj(input) ? input : {};
    for (i = 0; i < fields.length; i++) {
      k = fields[i][0];
      out[k] = cleanField(fields[i][1], has(input, k) ? input[k] : undefined, defaults ? defaults[k] : undefined);
    }
    return out;
  }

  // isSound(state, keys): true when every listed numeric field that is present is a sound number.
  function isSound(state, keys) {
    for (var i = 0; i < keys.length; i++) { var v = state[keys[i]]; if (v !== undefined && !isNum(v)) return false; }
    return true;
  }

  // countsSound(v): true when v is not a map, or every value in the map is a finite number >= 0 (a NaN written to storage comes back as null).
  function countsSound(v) {
    if (!isObj(v)) return true;
    var ks = Object.keys(v);
    for (var i = 0; i < ks.length; i++) if (!isNum(v[ks[i]])) return false;
    return true;
  }

//@begin codes
  // ---- codes ----
  // FNV-1a, 32 bit. style: 'padded36' (default, always 7 base-36 characters, so words pasted after a code are not swallowed), 'plain36' (base 36 with
  // no leading zeros, 1 to 7 characters) or 'hex8' (8 hex characters). The last two exist to read and write the codes of games that predate save-kit.
  function checksum(t, style) {
    var h = 0x811c9dc5;
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return style === 'hex8' ? ('00000000' + h.toString(16)).slice(-8) : style === 'plain36' ? h.toString(36) : ('0000000' + h.toString(36)).slice(-7);
  }
  // Base64 without padding, URL-safe. Uses the browser's own Uint8Array.toBase64/fromBase64 when it has them (Chrome 140, Firefox 133,
  // Safari 18.2), else the loops below.
  function toB64(bytes) {
//@begin nativeBase64
    try { if (typeof bytes.toBase64 === 'function') return bytes.toBase64({ alphabet: 'base64url' }).replace(/=+$/, ''); } catch (e) {}
//@end
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64(t) {
//@begin nativeBase64
    try { if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(t, { alphabet: 'base64url' }); } catch (e) {}
//@end
    var bin = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  var squeezes = null;   // asked once per page: building two streams on every export and import was wasted work
  function canSqueeze() {
    if (squeezes === null) { try { new CompressionStream('deflate-raw'); new DecompressionStream('deflate-raw'); squeezes = true; } catch (e) { squeezes = false; } }
    return squeezes;
  }
  function deflate(bytes) {
    var out = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(out).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
//@begin streamLimit
  // Unpacks deflate-raw bytes, reading the output in pieces; gives up (rejects TOO_BIG) as soon as the output passes `limit`,
  // so a tiny code that expands about 1000 to 1 is cut off early instead of filling memory.
  function inflate(bytes, limit) {
    return new Promise(function (resolve, reject) {
      var reader, chunks = [], total = 0;
      try { reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(); } catch (e) { reject(DAMAGED); return; }
      function pump() {
        reader.read().then(function (r) {
          if (r.done) {
            var out = new Uint8Array(total), at = 0;
            chunks.forEach(function (c) { out.set(c, at); at += c.length; });
            resolve(out); return;
          }
          total += r.value.length;
          if (total > limit) { try { reader.cancel().then(null, function () {}); } catch (e) {} reject(TOO_BIG); return; }
          chunks.push(r.value);
          pump();
        }, function () { reject(DAMAGED); });
      }
      pump();
    });
  }
//@else
//@   function inflate(bytes, limit) {   // simple form: unpacks it all, then checks the size (a tiny hostile code can briefly fill memory)
//@     var p;
//@     try { p = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer(); } catch (e) { return Promise.reject(DAMAGED); }
//@     return p.then(function (b) { return b.byteLength > limit ? Promise.reject(TOO_BIG) : new Uint8Array(b); }, function () { return Promise.reject(DAMAGED); });
//@   }
//@end
  function escapeRe(t) { return t.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&'); }
//@end

  // ---- the store ----
  // create({ key, schema, defaults, soundKeys, prefix, storage, maxCodeBytes, maxCodeChars, backupEveryMs })
  //   key: localStorage key. schema/defaults: see validate(). soundKeys: numeric fields that must be sound to write a save
  //   (default: every 'num'/'int' field; every value inside a 'counts' field is always checked too). prefix: 2 capital letters + digit for codes,
  //   default 'SK1'. maxCodeBytes: biggest save a code may unpack to (default 262144 = 256 KiB). maxCodeChars: longest pasted text
  //   importCode() will look at (default about 4/3 of maxCodeBytes plus 1024, so 350549). storage: any object with getItem/setItem.
  function create(o) {
    o = o || {};
    var key = o.key, schema = o.schema || {}, defaults = o.defaults || {}, prefix = o.prefix || 'SK1';
    var storage = o.storage || null;
    if (!storage) { try { storage = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { storage = null; } }   // touching localStorage can throw when storage is blocked
//@begin codes
    var maxBytes = o.maxCodeBytes > 0 ? o.maxCodeBytes : DEFAULT_MAX_BYTES;
    var maxChars = o.maxCodeChars > 0 ? o.maxCodeChars : Math.ceil(maxBytes * 4 / 3) + 1024;
//@end
    var fields = fieldsOf(schema);
    var kinds = function (t) { return fields.filter(function (f) { return f[1].type === t; }).map(function (f) { return f[0]; }); };
    var soundKeys = o.soundKeys || kinds('num').concat(kinds('int'));
    var countKeys = kinds('counts');
//@begin codes
    var re = new RegExp(escapeRe(prefix) + '([zp])\\.([A-Za-z0-9_-]+)\\.');
    var style = o.codeCheck;
//@end
    var off = false, backupAt = 0, backupEvery = o.backupEveryMs == null ? 60000 : o.backupEveryMs;
//@begin migrate
    var version = o.version > 0 ? Math.floor(o.version) : 0, migrate = typeof o.migrate === 'function' ? o.migrate : null;
//@end
//@begin skipUnchanged
    var skipMs = o.skipUnchangedMs > 0 ? o.skipUnchangedMs : 0;
    var lastProbe = null, lastWriteAt = 0, lastSeen;   // for skipUnchangedMs: the last written text (with seen = 0), when, and its seen
//@end
//@begin compact
    var compact = !!o.compactCodes;
//@end
    var stamp = o.stamp || 'seen', bak = o.backupKey || key + '-backup', damaged = o.damagedKey || '', after = typeof o.afterValidate === 'function' ? o.afterValidate : null;
    var orphan = o.readBackupWithoutMain !== false;   // false: a missing main slot never brings back a leftover backup

//@begin migrate
    // Runs the game's migrate(save, fromVersion) on a save written with a lower `version` (no `v` counts as 0); a migrate that
    // throws or returns a non-object leaves the save as it was. The save is a copy, so migrate may change it freely.
    function upgrade(raw) {
      if (!migrate || !version) return raw;
      var from = isNum(raw.v) ? Math.floor(raw.v) : 0;
      if (from >= version) return raw;
      try { var r = migrate(JSON.parse(JSON.stringify(raw)), from); return isObj(r) ? r : raw; } catch (e) { return raw; }
    }
    function copyOf(x) { var c = {}; Object.keys(x).forEach(function (k) { c[k] = x[k]; }); return c; }
//@else
//@     function upgrade(raw) { return raw; }
//@end

    // How many fields hold a broken number (numbers in soundKeys, and values inside counts fields).
    function badFields(x) {
      var n = 0, i, v;
      for (i = 0; i < soundKeys.length; i++) { v = x[soundKeys[i]]; if (v !== undefined && !isNum(v)) n++; }
      for (i = 0; i < countKeys.length; i++) if (!countsSound(x[countKeys[i]])) n++;
      return n;
    }
    function soundState(x) { return isObj(x) && badFields(x) === 0; }
    function textOf(slot) { try { return storage.getItem(slot); } catch (e) { return undefined; } }   // null = empty slot, undefined = storage refused
    function parseSlot(t) {
      try {
        var x = JSON.parse(t || 'null');
        if (isObj(x)) return x;
      } catch (e) {}
      return null;
    }
    function readSlot(slot) { return parseSlot(textOf(slot)); }
    // Schema check, then the game's own afterValidate(clean, raw) if there is one: it may change `clean` in place, return a replacement object, or return
    // false/null to refuse the save. A hook that throws is ignored (the schema-checked state is used). Returns null when refused.
    function finish(raw) {
      var c = validateWith(fields, defaults, upgrade(raw)), r;
      if (!after) return c;
      try { r = after(c, raw); } catch (e) { return c; }
      return r === false || r === null ? null : isObj(r) ? r : c;
    }
    var api = {
      validate: function (input) { return validateWith(fields, defaults, input); },
      // Returns a clean state rebuilt from the better slot (the main slot unless the backup has fewer broken numbers), else null.
      // With damagedKey, main-slot text that was not used (unreadable, refused by afterValidate, or worse than the backup) is copied there first.
      load: function () {
        try {
          var mt = textOf(key), a = parseSlot(mt), b = null, first, second, out = null, used = null;
          if (mt === null && !orphan) return null;
          if (!a || badFields(a) > 0) b = readSlot(bak);   // a sound main slot can never lose to the backup, so only read the backup when it could matter
          if (a || b) {
            first = !b ? a : !a ? b : (badFields(b) < badFields(a) ? b : a);
            out = finish(first); used = first;
            if (!out) {   // refused by afterValidate: try the other slot
              second = first === a ? (b || readSlot(bak)) : a;
              out = second ? finish(second) : null; used = second;
            }
          }
          if (damaged && mt && (!a || used !== a)) { try { storage.setItem(damaged, mt); } catch (e) {} }
          return out;
        } catch (e) { return null; }
      },
      // Writes the state. Returns false (and writes nothing) if a number is broken, saving is switched off, or storage fails.
      // Returns true when the main slot was written, even if the backup write failed (the backup is tried again next time).
      // With the skipUnchangedMs option, a save whose fields are all the same as the last written one (only `seen` differs) is not written
      // again until that many ms have passed; save(state, true) always writes.
      save: function (state, force) {
        try {
          if (off || !storage || !soundState(state)) return false;
          var now = Date.now(), probe = null;
//@begin migrate
          if (version) state.v = version;
//@end
//@begin skipUnchanged
          if (skipMs) {
            state[stamp] = 0; probe = JSON.stringify(state);
            if (force !== true && probe === lastProbe && now - lastWriteAt < skipMs) { state[stamp] = lastSeen; return true; }
          }
//@end
          state[stamp] = now;
          var txt = JSON.stringify(state);
          storage.setItem(key, txt);
//@begin skipUnchanged
          lastProbe = probe; lastWriteAt = now; lastSeen = now;
//@end
          if (Date.now() - backupAt > backupEvery) {
            try { storage.setItem(bak, txt); backupAt = Date.now(); } catch (e) { /* storage full: the main slot is safe */ }
          }
          return true;
        } catch (e) {
//@begin skipUnchanged
          lastProbe = null;
//@end
          return false;
        }
      },
      forceBackupNext: function () { backupAt = 0; },
      // Switches saving off (true) or on (false). Used while a loaded save waits for a page reload, so the old game can't overwrite it.
      pause: function (v) { off = v !== false; },
//@begin autosave
      // Calls getState() and saves: every `every` ms, on pagehide, and when the page is hidden. A getState() that throws is skipped.
      autosave: function (getState, every) {
        var tick = function (force) { var s; try { s = getState(); } catch (e) { return; } api.save(s, force === true); };
        var iv = setInterval(tick, every || 2000);
        function onLeave() { tick(true); }   // leaving or hiding the page always writes, even with skipUnchangedMs
        function onHide() { if (typeof document !== 'undefined' && document.hidden) { api.forceBackupNext(); tick(true); } }
        if (typeof window !== 'undefined') { window.addEventListener('pagehide', onLeave); document.addEventListener('visibilitychange', onHide); }
        return function stop() { clearInterval(iv); if (typeof window !== 'undefined') { window.removeEventListener('pagehide', onLeave); document.removeEventListener('visibilitychange', onHide); } };
      },
//@end
//@begin codes
      // -> Promise<string> like 'SK1z.<data>.<check>' (z = squeezed, p = plain; whichever is shorter). Rejects with a message (string)
      //    when there is no state, a number is broken, or the save is bigger than maxCodeBytes. Never throws.
      exportCode: function (state) {
        try {
          if (!isObj(state)) return Promise.reject('There is nothing to make a code from yet.');
          if (!soundState(state)) return Promise.reject('A number in the game is broken, so no code was made. Reload the page and try again.');
          try { state[stamp] = Date.now(); } catch (e) {}
          var body = state;
//@begin compact
          if (compact) {   // only the schema's fields that differ from their default (and `seen` only if the schema lists it)
            body = {};
            Object.keys(schema).forEach(function (k) { if (has(state, k) && !(has(defaults, k) && JSON.stringify(state[k]) === JSON.stringify(defaults[k]))) body[k] = state[k]; });
          }
//@end
//@begin migrate
          if (version) { if (body === state) body = copyOf(state); body.v = version; }
//@end
          var raw = new TextEncoder().encode(JSON.stringify(body));
          if (raw.length > maxBytes) return Promise.reject('This save is too big to turn into a code.');
          var plain = toB64(raw);
          var done = function (flag, d) { return prefix + flag + '.' + d + '.' + checksum(d, style); };
          if (!canSqueeze()) return Promise.resolve(done('p', plain));
          return deflate(raw).then(function (b) { var z = toB64(b); return z.length < plain.length ? done('z', z) : done('p', plain); }, function () { return done('p', plain); });
        } catch (e) { return Promise.reject('This save could not be turned into a code.'); }
      },
      // -> Promise<clean state>; rejects with a short human-readable message (string). Never throws.
      //    Refuses text longer than maxCodeChars, and stops unpacking when the result passes maxCodeBytes.
      importCode: function (text) {
        try {
          var t = String(text == null ? '' : text);
          if (t.length > maxChars) return Promise.reject(TOO_BIG);
          var flat = t.replace(/\s+/g, '');
          var m = re.exec(flat);
          if (!m) return Promise.reject(flat.indexOf(prefix) >= 0 ? INCOMPLETE : 'That is not a save code for this game.');
          var want = checksum(m[2], style);
          if (flat.substr(m.index + m[0].length, want.length) !== want) return Promise.reject(INCOMPLETE);
          var bytes;
          try { bytes = fromB64(m[2]); } catch (e) { return Promise.reject(DAMAGED); }
          var get;
          if (m[1] === 'z') get = canSqueeze() ? inflate(bytes, maxBytes) : Promise.reject('This browser cannot open that code. Try a newer browser.');
          else get = bytes.length > maxBytes ? Promise.reject(TOO_BIG) : Promise.resolve(bytes);
          return get.then(function (b) {
            var x = JSON.parse(new TextDecoder().decode(b));
            if (!soundState(x)) throw 0;
            x = finish(x);
            if (!x) throw 0;
            return x;
          }).catch(function (e) { throw typeof e === 'string' ? e : DAMAGED; });
        } catch (e) { return Promise.reject(DAMAGED); }
      },
//@end
//@begin onOtherTab
      // Calls cb(cleanState, event) when ANOTHER tab of this site changes the save (the browser never tells the tab that wrote it), or
      // cb(null, event) when it removed the save. Use it to stop an old tab from overwriting newer progress: pause(true) and offer a reload.
      // Returns a function that stops listening. Does nothing outside a browser.
      onOtherTab: function (cb) {
        if (typeof window === 'undefined' || !window.addEventListener || typeof cb !== 'function') return function () {};
        function on(e) {
          if (e.key !== null && e.key !== key) return;   // key null: the other tab cleared all storage
          if (e.storageArea && storage && e.storageArea !== storage) return;
          var x = null, clean = null;
          try { x = e.newValue == null ? null : JSON.parse(e.newValue); } catch (err) {}
          try { if (isObj(x)) clean = finish(x); } catch (err) {}
          try { cb(clean, e); } catch (err) {}
        }
        window.addEventListener('storage', on);
        return function () { window.removeEventListener('storage', on); };
      },
//@end
//@begin persist
      // Asks the browser not to delete this site's storage when space runs low (and, in Safari, after a long time unvisited). Resolves
      // true if storage is now (or already was) persistent, false if refused or unsupported; never rejects. The browser may say no.
      persist: function () {
        try {
          var sm = navigator.storage;
          if (sm && sm.persist) return (sm.persisted ? sm.persisted() : Promise.resolve(false)).then(function (p) { return p || sm.persist(); }).then(Boolean, function () { return false; });
        } catch (e) {}
        return Promise.resolve(false);
      },
//@end
//@begin stageImport
      // Stores an imported state for the next page load: keeps the current game in `<key>-before-load`, pauses saving.
      // Call location.reload() afterwards. Returns false if storage refused.
      stageImport: function (imported, currentState) {
        try {
          imported[stamp] = Date.now();
          if (currentState) storage.setItem(key + '-before-load', JSON.stringify(currentState));
          off = true;
//@begin skipUnchanged
          lastProbe = null;
//@end
          storage.setItem(key, JSON.stringify(imported));
          storage.setItem(bak, JSON.stringify(imported));
          return true;
        } catch (e) { off = false; return false; }
      }
//@end
    };
    return api;
  }

//@begin twoTap
  // twoTap(fn, ms, onArm, onDisarm) -> a click handler: the first call arms (and calls onArm), a second call within ms runs fn.
  function twoTap(fn, ms, onArm, onDisarm) {
    var armed = null;
    return function () {
      if (!armed) { armed = setTimeout(function () { armed = null; if (onDisarm) onDisarm(); }, ms || 3000); if (onArm) onArm(); return false; }
      clearTimeout(armed); armed = null; if (onDisarm) onDisarm();
      fn.apply(this, arguments); return true;
    };
  }
//@end

  return {
    create: create, validate: validate, isSound: isSound,
//@begin codes
    checksum: checksum, toBase64Url: toB64, fromBase64Url: fromB64,
//@end
//@begin twoTap
    twoTap: twoTap,
//@end
    bag: bag, has: has
  };
});
