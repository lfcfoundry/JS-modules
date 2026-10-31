#!/usr/bin/env node
// Row ranges and column stats of lfc-pack, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Part 1: reading rows from..from+99 with unpackRows against reading everything with unpack and cutting (ms, smaller is better).
// Part 2: pack time and file size of the build under test against OLD=path/to/older/lfc-pack.js (the column statistics add a null count and a distinct count to the block meta), taking turns.
// Run: node tests/lfc-pack-rows-browser.js <chromium|firefox|webkit> [out.json]     Env: BB=block bytes (default 2000000), OLD=/path/old/lfc-pack.js (default /tmp/lfc-pack-old.js), REPS=7
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const NEW = fs.readFileSync(path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8'), OLD = fs.readFileSync(process.env.OLD || '/tmp/lfc-pack-old.js', 'utf8'), REPS = +process.env.REPS || 7;
const PAGE = (`
var DATA = null, FILE = null;
async function setup(which) {
  var J = window.LfcPack; await J.init(); await window.LfcOld.init(); var sd = 5, i, rows = [];
  var r = function () { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
  for (i = 0; i < 200000; i++) rows.push(JSON.stringify({ ts: 1760000000 + i * 3 + Math.floor(r() * 3), level: ['INFO', 'WARN', 'ERROR', 'DEBUG'][Math.floor(r() * 4)], status: r() < 0.9 ? 200 : 500, user: r() < 0.3 ? null : 'u' + Math.floor(r() * 900), ms: Math.round(r() * 5000) / 100, path: '/item/' + Math.floor(r() * 300) }));
  DATA = new TextEncoder().encode(rows.join('\\n') + '\\n'); FILE = J.pack(DATA, { blockBytes: +'__BB__' });
  return { rows: 200000, bytes: DATA.length, packed: FILE.length, blocks: J.info(FILE).blocks, hasRows: typeof J.unpackRows === 'function', hasStats: typeof J.stats === 'function' };
}
async function job(name, old) {
  var J = old ? window.LfcOld : window.LfcPack, t = performance.now(), x;
  if (name === 'pack') { x = J.pack(DATA, { blockBytes: +'__BB__' }); return performance.now() - t; }
  var m = /^(range|full) (\\d+)$/.exec(name), from = +m[2];
  if (m[1] === 'range') x = J.unpackRows(FILE, { from: from, count: 100 }); else x = J.unpack(FILE).slice(from, from + 100);
  if (x.length !== 100) throw new Error('rows ' + x.length);
  return performance.now() - t;
}
async function size(old) { return (old ? window.LfcOld : window.LfcPack).pack(DATA, { blockBytes: +'__BB__' }).length; }`).replace(/__BB__/g, process.env.BB || '2000000');
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/new.html': '<!doctype html><meta charset=utf-8><script>' + OLD + '</script><script>window.LfcOld = window.LfcPack;</script><script>' + NEW + '</script><script>' + PAGE + '</script>' });
  const pn = await b.newPage(); await pn.goto(srv.base + '/new.html');
  const sn = await pn.evaluate('setup()');
  const jobs = ['range 0', 'full 0', 'range 100000', 'full 100000', 'range 199800', 'full 199800'];
  const rm = await T.rotate(jobs, REPS, (n) => pn.evaluate((x) => job(x), n));
  const pm = await T.rotate(['old', 'new'], REPS, (n) => pn.evaluate((o) => job('pack', o), n === 'old'));
  const sizeNew = await pn.evaluate('size()'), sizeOld = await pn.evaluate(() => size(true));
  console.log('file: ' + sn.rows + ' rows, ' + sn.bytes + ' bytes of text -> ' + sn.packed + ' packed, ' + sn.blocks + ' blocks');
  console.log('part 1, 100 rows starting at row N (ms, median of ' + REPS + '; smaller is better)');
  console.log(T.table([0, 100000, 199800].map((n) => ({ n, range: rm['range ' + n].toFixed(1), full: rm['full ' + n].toFixed(1), faster: (rm['full ' + n] / rm['range ' + n]).toFixed(1) + 'x' })), [{ key: 'n', title: 'N', align: 'left' }, { key: 'range', title: 'unpackRows' }, { key: 'full', title: 'unpack + cut' }, { key: 'faster', title: 'times faster' }]));
  console.log('part 2, pack 200,000 rows (ms, median of ' + REPS + '; smaller is better): old ' + pm.old.toFixed(0) + ', new ' + pm.new.toFixed(0) + ' (' + ((pm.new / pm.old - 1) * 100).toFixed(1) + '%); file bytes old ' + sizeOld + ', new ' + sizeNew + ' (' + (sizeNew - sizeOld) + ' bytes)');
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ rows: rm, pack: pm, sizeOld, sizeNew, file: sn }, null, 1));
  await pn.close().catch(() => {}); srv.close(); return sn.hasRows;
});
