// packColumns (2.17.0): a table held as columns writes the same bytes as pack() of the matching rows (all data sets, three modes, typed columns, nested columns), and bad input fails clearly. Node only.
'use strict';
var assert = require('assert'), path = require('path'), D0 = require('./data.js');
var D = D0.sets || D0, M = require(path.resolve(__dirname, '..', 'memory-compression.js')).jso, n = 0;
function same(a, b, msg) { assert.deepStrictEqual(Buffer.from(a), Buffer.from(b), msg); }
Object.keys(D).forEach(function (set) {
  [20, 1000, 20000].forEach(function (N) {
    var rows; try { rows = D[set](N); } catch (e) { return; }
    if (!Array.isArray(rows) || !rows.length || typeof rows[0] !== 'object' || rows[0] === null || Array.isArray(rows[0])) return;
    var keys = Object.keys(rows[0]); if (!rows.every(function (r) { return r && Object.keys(r).join() === keys.join(); })) return;
    var cols = {};
    keys.forEach(function (k) { var f = rows[0][k];
      if (f && typeof f === 'object' && !Array.isArray(f) && Object.getPrototypeOf(f) === Object.prototype && rows.every(function (r) { return r[k] && typeof r[k] === 'object' && Object.keys(r[k]).join() === Object.keys(f).join(); })) { cols[k] = {}; Object.keys(f).forEach(function (s) { cols[k][s] = rows.map(function (r) { return r[k][s]; }); }); }
      else cols[k] = rows.map(function (r) { return r[k]; }); });
    ['fast', 'small', 'balanced'].forEach(function (mode) { same(M.pack(rows, { mode: mode }), M.packColumns(cols, { mode: mode }), set + ' ' + N + ' ' + mode); n++; });
    var typed = {}; Object.keys(cols).forEach(function (k) { var v = cols[k]; typed[k] = Array.isArray(v) && v.every(function (x) { return typeof x === 'number'; }) ? Float64Array.from(v) : v; });
    same(M.pack(rows, { mode: 'fast' }), M.packColumns(typed, { mode: 'fast' }), set + ' ' + N + ' typed'); n++;
  });
});
var small = [{ a: 1, b: 'x' }, { a: 2, b: 'y' }];
same(M.pack(small), M.packColumns({ a: [1, 2], b: ['x', 'y'] }), 'small table'); n++;
same(M.pack(small, { refs: true }), M.packColumns({ a: [1, 2], b: ['x', 'y'] }, { refs: true }), 'refs:true'); n++;
assert.throws(function () { M.packColumns([1, 2]); }, Error, 'an array is not a column object');
assert.throws(function () { M.packColumns({ a: [1, 2], b: [1] }); }, Error, 'unequal lengths');
assert.throws(function () { M.packColumns({ a: new DataView(new ArrayBuffer(8)) }); }, Error, 'a DataView');
var wide = {}; for (var i = 0; i < 70; i++) wide['k' + i] = [1, 2, 3];
assert.throws(function () { M.packColumns(wide); }, Error, 'more than 64 keys'); n += 4;
console.log('packColumns: ' + n + ' cases, same bytes as pack(rows), bad input fails');
