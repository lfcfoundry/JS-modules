#!/usr/bin/env node
// Reading a small range of rows and the whole file, for the same data packed with different block sizes (files made by the build under test beforehand: DIR/NAME.bBYTES.lfc). ms, smaller is better. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/lfc-pack-blocksize-browser.js <chromium|firefox|webkit> [out.json]     Env: DIR=/tmp/stack, NAMES=geo,orders, SIZES=32768,262144,0 (or s32768 for DIR/NAME.s32768.lfc, packed with share: true), REPS=9, FROM=70000, COUNT=100, PACK=1 (also time packing DIR/NAME.ndjson with each file's options)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const LIB = fs.readFileSync(path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8'), DIR = process.env.DIR || '/tmp/stack', REPS = +process.env.REPS || 9;
const NAMES = (process.env.NAMES || 'geo,orders').split(','), SIZES = (process.env.SIZES || '32768,262144,0').split(','), FROM = +process.env.FROM || 70000, COUNT = +process.env.COUNT || 100, PACK = process.env.PACK === '1';
const PAGE = `
var files = {}, srcs = {};
async function setup(list) { await window.LfcPack.init(); for (var i = 0; i < list.length; i++) { var r = await fetch('/f/' + list[i]); files[list[i]] = new Uint8Array(await r.arrayBuffer()); var sn = list[i].split('.')[0]; if (${PACK} && !srcs[sn]) srcs[sn] = new Uint8Array(await (await fetch('/f/' + sn + '.ndjson')).arrayBuffer()); } return list.map(function (n) { return [n, files[n].length]; }); }
function job(name) {
  var m = name.split(' '), f = files[m[1]], t = performance.now(), x;
  if (m[0] === 'range') { x = window.LfcPack.unpackRows(f, { from: ${FROM}, count: ${COUNT} }); if (x.length !== ${COUNT}) throw new Error('rows'); }
  else if (m[0] === 'pack') { var q = /^[^.]+\.([bs])(\d+)\./.exec(m[1]), o = {}; if (+q[2]) o.blockBytes = +q[2]; if (q[1] === 's') o.share = true; x = window.LfcPack.pack(srcs[m[1].split('.')[0]], o); if (x.length !== f.length) throw new Error('size ' + x.length); }
  else { x = window.LfcPack.unpack(f); if (x.length < 1000) throw new Error('rows'); }
  return performance.now() - t;
}`;
T.main(async (b, which, outFile) => {
  const list = []; NAMES.forEach((n) => SIZES.forEach((s) => list.push(n + '.' + (/^\d/.test(s) ? 'b' + s : s) + '.lfc')));
  const routes = { '/p.html': '<!doctype html><meta charset=utf-8><script>' + LIB + '</script><script>' + PAGE + '</script>' };
  list.forEach((n) => { routes['/f/' + n] = { body: fs.readFileSync(path.join(DIR, n)), type: 'application/octet-stream' }; });
  if (PACK) NAMES.forEach((n) => { routes['/f/' + n + '.ndjson'] = { body: fs.readFileSync(path.join(DIR, n + '.ndjson')), type: 'application/octet-stream' }; });
  const srv = await T.serve(routes), p = await b.newPage(); await p.goto(srv.base + '/p.html');
  const sizes = await p.evaluate((l) => setup(l), list), jobs = [];
  list.forEach((n) => (PACK ? ['range', 'whole', 'pack'] : ['range', 'whole']).forEach((w) => jobs.push(w + ' ' + n)));
  const r = await T.rotate(jobs, REPS, (n) => p.evaluate((a) => job(a), n));
  const rows = []; sizes.forEach(([n, len]) => rows.push({ f: n, bytes: len, range: r['range ' + n].toFixed(1), whole: r['whole ' + n].toFixed(0), pack: PACK ? r['pack ' + n].toFixed(0) : '' }));
  console.log('range = unpackRows ' + COUNT + ' rows from row ' + FROM + '; whole = unpack (ms, median of ' + REPS + ')');
  console.log(T.table(rows, [{ key: 'f', title: 'File', align: 'left' }, { key: 'bytes', title: 'Bytes' }, { key: 'range', title: 'Range ms' }, { key: 'whole', title: 'Whole ms' }].concat(PACK ? [{ key: 'pack', title: 'Pack ms' }] : [])));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ browser: which, reps: REPS, sizes, results: r }, null, 1));
  await p.close().catch(() => {}); srv.close();
});
