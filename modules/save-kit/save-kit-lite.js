/*! save-kit-lite, new in save-kit 1.6.0 (API 1). Copyright (c) 2026 LFC Foundry. MIT License. Version 1.6.0 (API 1) */
/* The small version of save-kit: checked fields (num, int, flag, str), a backup slot, a save that refuses broken numbers. No counts, raw, codes,
 * autosave, versions, other-tab notice or IndexedDB: use save-kit.js for those. Same stored format and same answers as save-kit's create() for these types.
 *
 *   var kit = SaveKitLite({ key: 'mygame', schema: { score: 'num', level: 'int:99', sound: 'flag', name: 'str:20' }, defaults: { sound: 1 } });
 *   var state = kit.load() || kit.validate({});     // a clean state from the better of the main and backup slots, else null
 *   kit.save(state);                                // false (nothing written) if a number is NaN, Infinity or negative
 * Options: key, schema, defaults, storage (default localStorage), backupEveryMs (default 60000), backupKey (default key + '-backup'), stamp (default 'seen'). */
var SaveKitLite = function (o) {
  o = o || {};
  var key = o.key, bak = o.backupKey || key + '-backup', sc = o.schema || {}, df = o.defaults || {}, stamp = o.stamp || 'seen', names = Object.keys(sc), at = 0;
  var every = o.backupEveryMs == null ? 6e4 : o.backupEveryMs, ls = o.storage || null, own = Object.prototype.hasOwnProperty;
  if (!ls) { try { ls = typeof localStorage != 'undefined' ? localStorage : null; } catch (e) { ls = null; } }
  function ok(v) { return typeof v == 'number' && isFinite(v) && v >= 0; }
  function isObj(x) { return !!x && typeof x == 'object' && !Array.isArray(x); }
  var rules = names.map(function (k) { var m = /^(\w+)(?::(\d+))?$/.exec(String(sc[k])) || []; return { t: m[1], m: m[2] ? +m[2] : undefined }; }), n = names.length;   // read once
  function field(r, v, d) {
    switch (r.t) {
      case 'num': return ok(v) ? v : d;
      case 'int': return ok(v) ? Math.min(Math.floor(v), r.m == null ? Number.MAX_SAFE_INTEGER : r.m) : d;
      case 'flag': return v === 1 ? 1 : v === 0 ? 0 : d === 1 ? 1 : 0;
      case 'str': return typeof v == 'string' && v.length <= (r.m === 0 ? 0 : r.m || 200) ? v : d == null ? '' : d;
      default: return d;
    }
  }
  function validate(x) {
    var r = {}, k, j; x = isObj(x) ? x : {};
    for (j = 0; j < n; j++) { k = names[j]; r[k] = field(rules[j], own.call(x, k) ? x[k] : undefined, df[k]); }
    return r;
  }
  var sound = names.filter(function (k, j) { return rules[j].t == 'num' || rules[j].t == 'int'; }), ns = sound.length;
  function bad(x) { var c = 0, j, v; for (j = 0; j < ns; j++) { v = x[sound[j]]; if (v !== undefined && !ok(v)) c++; } return c; }
  function read(slot) { try { var x = JSON.parse(ls.getItem(slot)); return isObj(x) ? x : null; } catch (e) { return null; } }
  return {
    validate: validate,
    load: function () {
      try {
        var a = read(key), b = !a || bad(a) ? read(bak) : null, x = !b ? a : !a ? b : bad(b) < bad(a) ? b : a;
        return x && validate(x);
      } catch (e) { return null; }
    },
    save: function (s) {
      try {
        if (!ls || !isObj(s) || bad(s)) return false;
        s[stamp] = Date.now();
        var t = JSON.stringify(s); ls.setItem(key, t);
        if (Date.now() - at > every) { try { ls.setItem(bak, t); at = Date.now(); } catch (e) {} }
        return true;
      } catch (e) { return false; }
    },
    clear: function () { try { ls.removeItem(key); ls.removeItem(bak); return true; } catch (e) { return false; } }
  };
};
if (typeof module == 'object' && module.exports) module.exports = SaveKitLite;
