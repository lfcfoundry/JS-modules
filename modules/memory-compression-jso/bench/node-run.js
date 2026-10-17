'use strict';
// Usage: node node-run.js [dataset-regex] [contender-regex] [reps]
var path = require('path'), D = require('../test/data.js');
var DEP = process.env.JSO_DEPS || '/tmp/jso-deps/node_modules/';          // where `npm i` put the libraries (see bench/README.md)
var L = { JSO: require('../memory-compression-jso.js') };
if (process.env.JSO_OLD) L.JSO_OLD = require(process.env.JSO_OLD);          // an older build to compare with (for example the 1.0.0 file)
function tryReq(k, m, pick) { try { var x = require(DEP + m); L[k] = pick ? x[pick] : x; } catch (e) { console.error('missing', m, e.message.split('\n')[0]); } }
tryReq('fflate', 'fflate'); tryReq('lz4js', 'lz4js'); tryReq('msgpackr', 'msgpackr'); tryReq('cbor', 'cbor-x'); tryReq('msgpack', '@msgpack/msgpack'); tryReq('notepack', 'notepack.io'); tryReq('avsc', 'avsc'); tryReq('bson', 'bson');
tryReq('zipson', 'zipson'); tryReq('cjson', 'compress-json'); tryReq('lzstring', 'lz-string'); tryReq('jsonpack', 'jsonpack'); tryReq('fl', '@uwdata/flechette'); L.arrow = true; L.v8 = require('v8');
var N = { 'nfm-links': 300000, 'nfm-nodes': 100000, 'api-users': 50000, 'geojson': 20000, 'events': 200000, 'small': 1000, 'irregular': 20000 };
var dsf = process.argv[2] && new RegExp(process.argv[2]), cf = process.argv[3] && new RegExp(process.argv[3]), reps = +process.argv[4] || 3;
var C = require('./contenders.js')(L).filter(function (c) { return !cf || cf.test(c.id); });
function best(f, k) { var b = 1e18, r, i, t; for (i = 0; i < k; i++) { if (global.gc) global.gc(); t = process.hrtime.bigint(); r = f(); t = Number(process.hrtime.bigint() - t) / 1e6; if (t < b) b = t; } return { ms: b, r: r }; }
var report = [];
Object.keys(D.sets).forEach(function (name) {
  if (dsf && !dsf.test(name)) return;
  var full = D.sets[name](N[name]), json0 = JSON.stringify(full).length, rows = [];
  C.forEach(function (c) {
    var data = c.cap && full.length > c.cap ? full.slice(0, c.cap) : full, json = data === full ? json0 : JSON.stringify(data).length;
    var row = { id: c.id, group: c.group, capped: data !== full, json: json };
    try {
      var h = c.make(data), reps2 = name === 'small' ? reps * 20 : reps;
      var inner = name === 'small' ? 20 : 1;
      var e = best(function () { var r; for (var q = 0; q < inner; q++) r = h.enc(data); return r; }, reps2); var bytes = e.r;
      var d = best(function () { var r; for (var q = 0; q < inner; q++) r = h.dec(bytes); return r; }, reps2);
      row.size = bytes.length; row.enc = e.ms / inner; row.dec = d.ms / inner;
      var diff = D.same(data, d.r, undefined, c.loose); row.exact = diff ? 'differs: ' + diff.slice(0, 60) : (c.loose ? 'same values (own record class)' : 'exact');
    } catch (err) { row.fail = String(err.message || err).slice(0, 70); }
    rows.push(row);
  });
  console.log('\n### ' + name + ' (' + (Array.isArray(full) ? full.length : '?') + ' items, JSON text ' + (json0 / 1e6).toFixed(2) + ' MB)');
  console.log('| contender | size | % of JSON | pack ms | unpack ms | pack+unpack MB/s of JSON | round trip |');
  console.log('|---|---:|---:|---:|---:|---:|---|');
  rows.forEach(function (r) {
    if (r.fail) console.log('| ' + r.id + ' | | | | | | failed: ' + r.fail + ' |');
    else console.log('| ' + r.id + (r.capped ? ' (first 20,000 items only)' : '') + ' | ' + (r.size / 1e6).toFixed(3) + ' MB | ' + (r.size / r.json * 100).toFixed(1) + '% | ' + r.enc.toFixed(1) + ' | ' + r.dec.toFixed(1) + ' | ' + (r.json / 1e6 / ((r.enc + r.dec) / 1000)).toFixed(0) + ' | ' + r.exact + ' |');
  });
});
