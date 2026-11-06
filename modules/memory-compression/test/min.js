'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// Quick checks of the two smaller files (memory-compression.min.js and memory-compression-read.min.js): they carry the version in modules.json,
// the minified file packs the same bytes as the readable one, and the read-only file opens what the readable one packed. Rebuild both with node min/build.js.
var fs = require('fs'), path = require('path'), D = require('./data.js');
var dir = path.join(__dirname, '..'), reg = JSON.parse(fs.readFileSync(path.join(dir, '..', '..', 'modules.json'), 'utf8'));
var V = (reg.modules || reg).filter(function (m) { return m.id === 'memory-compression'; })[0].version;
var full = require(path.join(dir, 'memory-compression.js')), passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n   ' + (e && e.message)); } }
function same(a, b, label) { var e = D.same(a, b); if (e) throw new Error(label + ': ' + e); }
function bytesEq(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
var files = { min: 'memory-compression.min.js', read: 'memory-compression-read.min.js' }, mods = {};
Object.keys(files).forEach(function (k) {
  t(files[k] + ' carries version ' + V + ' (modules.json) and was built from this memory-compression.js; if not, run node modules/memory-compression/min/build.js', function () {
    var head = fs.readFileSync(path.join(dir, files[k]), 'utf8').split('\n')[0];
    if (head.indexOf('Version ' + V + ' (API ') < 0) throw new Error('header says ' + head.slice(0, 80));
    var id = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(dir, 'memory-compression.js'), 'utf8')).digest('hex').slice(0, 16);
    if (head.indexOf('Source ' + id + '.') < 0) throw new Error('built from another memory-compression.js (Source ' + id + ' expected)');
    if (/[^\x00-\x7f]/.test(fs.readFileSync(path.join(dir, files[k]), 'latin1'))) throw new Error('has characters outside ASCII');
  });
  mods[k] = require(path.join(dir, files[k]));
});
var sets = Object.keys(D.sets).slice(0, 6);
t('the minified file packs the same bytes as the readable file (' + sets.length + ' data sets, 3 modes)', function () {
  sets.forEach(function (s) { var rows = D.sets[s](3000); ['fast', 'balanced', 'small'].forEach(function (m) { if (!bytesEq(full.pack(rows, { mode: m }), mods.min.pack(rows, { mode: m }))) throw new Error(s + ' ' + m + ' bytes differ'); }); });
});
t('the read-only file opens what the readable file packed: unpack, view and no-wasm unpack', function () {
  sets.forEach(function (s) { var rows = D.sets[s](3000); ['fast', 'balanced', 'small'].forEach(function (m) { var pk = full.pack(rows, { mode: m }); same(mods.read.unpack(pk), rows, s + ' ' + m); same(mods.read.unpack(pk, { wasm: false }), rows, s + ' ' + m + ' no wasm'); if (Array.isArray(rows) && rows.length && rows[0] && typeof rows[0] === 'object' && !Array.isArray(rows[0])) same(mods.read.view(pk).get(1234), rows[1234], s + ' ' + m + ' view'); }); });
  var f = new Float64Array(20000); for (var i = 0; i < f.length; i++) f[i] = Math.sin(i) * 100; var r = mods.read.unpack(full.pack(f, { mode: 'small' })); if (!bytesEq(r, f)) throw new Error('floats differ');
});
t('the read-only file says clearly that it cannot pack', function () {
  var msg = ''; try { mods.read.pack([1, 2, 3]); } catch (e) { msg = String(e && e.message); }
  if (!/only in the full file/.test(msg)) throw new Error('got: ' + (msg || 'no error'));
});
console.log(failed ? failed + ' FAILED' : passed + ' checks passed'); process.exit(failed ? 1 : 0);
