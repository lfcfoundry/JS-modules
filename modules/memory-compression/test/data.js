'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// Deterministic data sets of plain JavaScript objects (same values in every engine), plus an exact deep-equality check.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JsoData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function rng(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function gauss(r) { return r() + r() + r() + r() - 2; }
  var PALETTE = [0xff3366cc, 0xffdc3912, 0xffff9900, 0xff109618, 0xff990099, 0xff0099c6];
  var WORDS = 'flow budget route energy water grid supply demand storage hub depot plant station yard link bridge pump valve tank'.split(' ');

  var sets = {
    // 300,000 link objects as a laid-out network keeps them: ids, a few decimals, noisy computed coordinates, a color, a kind
    'nfm-links': function (n) {
      var r = rng(11), out = [], i, f, t, kinds = ['flow', 'ref', 'dep', 'alias'];
      for (i = 0; i < n; i++) {
        f = Math.floor(i / 3); t = r() < 0.8 ? f + Math.floor(gauss(r) * 150) : Math.floor(r() * (n / 3)); t = Math.max(0, Math.min(n / 3 - 1, t));
        out.push({ id: i, from: f, to: t, weight: Math.floor(r() * 8 + 1) * 0.25, x1: gauss(r) * 400, y1: gauss(r) * 400, x2: gauss(r) * 400, y2: gauss(r) * 400, color: PALETTE[(f / 200 | 0) % 6], kind: kinds[Math.floor(r() * 4)], hot: r() < 0.05 });
      }
      return out;
    },
    // 100,000 item objects: label text, 3D position, group, a small nested style, a few tags
    'nfm-nodes': function (n) {
      var r = rng(12), out = [], i, g, tags, k;
      for (i = 0; i < n; i++) {
        g = (i / 200) | 0; tags = []; k = Math.floor(r() * 4); while (k--) tags.push(WORDS[Math.floor(r() * WORDS.length)]);
        out.push({ id: i, label: 'Item ' + i + ' ' + WORDS[i % WORDS.length], group: g, x: Math.cos(g) * 50 + gauss(r) * 8, y: Math.sin(g * 1.3) * 50 + gauss(r) * 8, z: g * 0.02 + gauss(r) * 3, size: 1 + Math.floor(r() * 4) * 0.5, style: { fill: PALETTE[g % 6], stroke: 0xff000000, w: 1.5 }, tags: tags, pinned: r() < 0.01 });
      }
      return out;
    },
    // a typical REST answer: users with strings, booleans, nested address, roles
    'api-users': function (n) {
      var r = rng(13), out = [], i, first = ['Ana', 'Ben', 'Chen', 'Dara', 'Eli', 'Farah', 'Gus', 'Hana', 'Ivo', 'Jun'], last = ['Smith', 'Okafor', 'Lopez', 'Nguyen', 'Kim', 'Rossi', 'Haddad', 'Novak'], cities = ['Boston', 'Lagos', 'Lima', 'Hanoi', 'Seoul', 'Rome', 'Cairo', 'Brno'], roles = ['admin', 'editor', 'viewer', 'owner'], k, rl;
      for (i = 0; i < n; i++) {
        k = Math.floor(r() * 3) + 1; rl = []; while (k--) rl.push(roles[Math.floor(r() * 4)]);
        out.push({ id: 100000 + i, name: first[i % 10] + ' ' + last[Math.floor(r() * 8)], email: 'user' + i + '@example.org', active: r() < 0.8, created: '2025-' + ('0' + (1 + (i % 12))).slice(-2) + '-' + ('0' + (1 + (i % 28))).slice(-2) + 'T' + ('0' + (i % 24)).slice(-2) + ':15:00Z', score: Math.round(r() * 10000) / 100, address: { city: cities[Math.floor(r() * 8)], zip: String(10000 + Math.floor(r() * 89999)), geo: [Math.round((r() * 180 - 90) * 1e5) / 1e5, Math.round((r() * 360 - 180) * 1e5) / 1e5] }, roles: rl });
      }
      return out;
    },
    // GeoJSON-like features: coordinate lists with 6 decimals
    'geojson': function (n) {
      var r = rng(14), out = [], i, j, k, pts, x, y;
      for (i = 0; i < n; i++) {
        k = 5 + Math.floor(r() * 25); pts = []; x = r() * 360 - 180; y = r() * 160 - 80;
        for (j = 0; j < k; j++) { x += gauss(r) * 0.01; y += gauss(r) * 0.01; pts.push([Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]); }
        out.push({ type: 'Feature', properties: { name: 'Road ' + i, lanes: 1 + (i % 4), speed: 30 + 10 * (i % 8) }, geometry: { type: 'LineString', coordinates: pts } });
      }
      return out;
    },
    // a log: increasing timestamps, levels, templated messages, durations
    'events': function (n) {
      var r = rng(15), out = [], i, t = 1760000000000, lv = ['info', 'info', 'info', 'warn', 'error', 'debug'];
      for (i = 0; i < n; i++) {
        t += Math.floor(r() * 50);
        out.push({ ts: t, level: lv[Math.floor(r() * 6)], user: Math.floor(r() * 5000), msg: 'request ' + WORDS[Math.floor(r() * WORDS.length)] + ' took ' + Math.floor(r() * 900) + ' ms', ms: Math.floor(r() * 900), ok: r() < 0.97 });
      }
      return out;
    },
    // 1000 small records of 10 keys: the latency case
    'small': function (n) {
      var r = rng(16), out = [], i;
      for (i = 0; i < n; i++) out.push({ a: i, b: r(), c: 'k' + (i % 7), d: r() < 0.5, e: i * 2, f: null, g: [i, i + 1], h: { x: i }, i: 'text ' + i, j: Math.floor(r() * 1000) / 10 });
      return out;
    },
    // irregular JSON: depth, mixed types, optional keys (a stress case for the general path)
    'irregular': function (n) {
      var r = rng(17), out = [], i;
      function val(d) {
        var k = Math.floor(r() * (d > 3 ? 6 : 9));
        switch (k) {
          case 0: return Math.floor(r() * 1000); case 1: return r() * 100; case 2: return 'str' + Math.floor(r() * 50);
          case 3: return r() < 0.5; case 4: return null; case 5: return -Math.floor(r() * 1e6);
          case 6: { var a = [], m = Math.floor(r() * 5); while (m--) a.push(val(d + 1)); return a; }
          default: { var o = {}, q = Math.floor(r() * 5), key; while (q--) { key = 'k' + Math.floor(r() * 12); o[key] = val(d + 1); } return o; }
        }
      }
      for (i = 0; i < n; i++) out.push(val(0));
      return out;
    }
  };

  // exact equality for the value domain: NaN equals NaN, -0 differs from 0, undefined is a value, key order counts, Date/Map/Set/typed arrays compare by content
  function same(a, b, path, loose) {                    // loose: ignore prototypes (for libraries that hand back their own record classes)
    path = path || '$';
    if (a === b) { if (a === 0 && 1 / a !== 1 / b) return path + ': 0 vs -0'; return null; }
    if (typeof a !== typeof b) return path + ': type ' + typeof a + ' vs ' + typeof b;
    if (typeof a === 'number') return a !== a && b !== b ? null : path + ': ' + a + ' vs ' + b;
    if (typeof a !== 'object' || a === null || b === null) return path + ': ' + String(a) + ' vs ' + String(b);
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return path + ': array length';
      for (var i = 0; i < a.length; i++) { var e = same(a[i], b[i], path + '[' + i + ']', loose); if (e) return e; }
      return null;
    }
    if (a instanceof Date) return b instanceof Date && (a.getTime() === b.getTime() || (a.getTime() !== a.getTime() && b.getTime() !== b.getTime())) ? null : path + ': date';
    if (a instanceof Map) {
      if (!(b instanceof Map) || a.size !== b.size) return path + ': map size';
      var ka = Array.from(a.entries()), kb = Array.from(b.entries());
      for (i = 0; i < ka.length; i++) { e = same(ka[i][0], kb[i][0], path + '.key' + i, loose) || same(ka[i][1], kb[i][1], path + '.val' + i, loose); if (e) return e; }
      return null;
    }
    if (a instanceof Set) {
      if (!(b instanceof Set) || a.size !== b.size) return path + ': set size';
      var sa = Array.from(a), sb = Array.from(b);
      for (i = 0; i < sa.length; i++) { e = same(sa[i], sb[i], path + '.item' + i, loose); if (e) return e; }
      return null;
    }
    if (a instanceof RegExp) return b instanceof RegExp && a.source === b.source && a.flags === b.flags ? null : path + ': regexp';
    if (a instanceof ArrayBuffer) { if (!(b instanceof ArrayBuffer) || a.byteLength !== b.byteLength) return path + ': buffer'; var ua = new Uint8Array(a), ub = new Uint8Array(b); for (i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return path + ': buffer byte ' + i; return null; }
    if (ArrayBuffer.isView(a)) {
      if (a.constructor !== b.constructor || a.length !== b.length) return path + ': typed array ' + a.constructor.name + ' vs ' + (b && b.constructor && b.constructor.name);
      for (i = 0; i < a.length; i++) if (!(a[i] === b[i] || (a[i] !== a[i] && b[i] !== b[i])) || (a[i] === 0 && 1 / a[i] !== 1 / b[i])) return path + ': typed element ' + i;
      return null;
    }
    if (!loose && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return path + ': prototype';
    var ka2 = Object.keys(a), kb2 = Object.keys(b);
    if (ka2.length !== kb2.length) return path + ': key count ' + ka2.length + ' vs ' + kb2.length;
    for (i = 0; i < ka2.length; i++) {
      if (ka2[i] !== kb2[i]) return path + ': key ' + ka2[i] + ' vs ' + kb2[i];
      e = same(a[ka2[i]], b[kb2[i]], path + '.' + ka2[i], loose); if (e) return e;
    }
    return null;
  }
  return { sets: sets, same: same, rng: rng };
});
