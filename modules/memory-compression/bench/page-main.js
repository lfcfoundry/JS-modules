'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// In-page runner for the comparison: window.runBench(mode, datasetRegex, contenderRegex) -> {ua, rows[]}. No explicit gc() in browsers (not available), so every timing is the best of several runs.
(function () {
  var D = window.JsoData, L = { JSO: window.MemoryCompressionJSO, JSO_OLD: window.MCJSO_OLD, fflate: window.fflate, lz4js: window.lz4js, msgpackr: window.msgpackr, cbor: window.CBOR, msgpack: window.MessagePack, avsc: window.AVSC };
  var SIZES = { full: { 'nfm-links': 300000, 'nfm-nodes': 100000, 'api-users': 50000, 'geojson': 20000, 'events': 200000, 'small': 1000, 'irregular': 20000 },
                quick: { 'nfm-links': 60000, 'nfm-nodes': 20000, 'api-users': 10000, 'geojson': 4000, 'events': 40000, 'small': 1000, 'irregular': 4000 } };
  function now() { return performance.now(); }
  function best(f, k) { var b = 1e18, r, i, t; for (i = 0; i < k; i++) { t = now(); r = f(); t = now() - t; if (t < b) b = t; } return { ms: b, r: r }; }
  window.runBench = function (mode, dsRe, cRe) {
    var N = SIZES[mode === 'warm' ? 'quick' : mode] || SIZES.full, reps = mode === 'quick' ? 3 : mode === 'warm' ? 12 : 4, dsf = dsRe && new RegExp(dsRe), cf = cRe && new RegExp(cRe), out = [];
    var C = window.makeContenders(L).filter(function (c) { return !cf || cf.test(c.id); });
    Object.keys(D.sets).forEach(function (name) {
      if (dsf && !dsf.test(name)) return;
      var full = D.sets[name](N[name]), json0 = JSON.stringify(full).length;
      C.forEach(function (c) {
        var data = c.cap && full.length > c.cap ? full.slice(0, c.cap) : full, json = data === full ? json0 : JSON.stringify(data).length;
        var row = { set: name, n: data.length, id: c.id, group: c.group, capped: data !== full, json: json };
        try {
          var h = c.make(data), inner = name === 'small' ? 20 : 1, r2 = name === 'small' ? reps * 5 : reps;
          var e = best(function () { var r; for (var q = 0; q < inner; q++) r = h.enc(data); return r; }, r2), bytes = e.r;
          var d = best(function () { var r; for (var q = 0; q < inner; q++) r = h.dec(bytes); return r; }, r2);
          row.size = bytes.length; row.enc = e.ms / inner; row.dec = d.ms / inner;
          var diff = D.same(data, d.r, undefined, c.loose); row.exact = diff ? 'differs: ' + diff.slice(0, 60) : (c.loose ? 'same values (own record class)' : 'exact');
        } catch (err) { row.fail = String(err && err.message || err).slice(0, 70); }
        out.push(row);
      });
    });
    return { ua: navigator.userAgent, cores: navigator.hardwareConcurrency, accelerated: L.JSO.accelerated(), mode: mode, rows: out };
  };
  window.benchReady = true;
})();
