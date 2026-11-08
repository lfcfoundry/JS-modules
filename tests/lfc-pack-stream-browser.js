#!/usr/bin/env node
// packParallelStream (lfc-pack 0.8.0): rows pushed in 64 KB pieces, blocks packed by 3 helper workers while the text arrives, against pack() on the main thread. Every pass checks the file is the same bytes. Fresh page per run, order alternated.
// Run: node tests/lfc-pack-stream-browser.js <chromium|firefox|webkit> [out.json]     Env: PAIRS=5, ROWS=1200000 (about 100 MB of 5-column rows; the call only pays on big inputs)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js'), PAIRS = +process.env.PAIRS || 5, ROWS = +process.env.ROWS || 1200000;
const SRC = fs.readFileSync(path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8').replace(/<\/script/g, '<\\/script');
const cities = ['Detroit', 'Boston', 'Austin', 'Denver', 'Seattle', 'Miami', 'Chicago', 'Portland'];
let s = 7; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296, L = [];
for (let i = 0; i < ROWS; i++) L.push(JSON.stringify({ id: i, name: 'name' + ((r() * 5000) | 0), city: cities[(r() * 8) | 0], date: '2026-0' + (1 + ((r() * 9) | 0)) + '-' + (10 + ((r() * 18) | 0)), score: +(r() * 100).toFixed(2) }));
const data = Buffer.from(L.join('\n') + '\n');
T.main(async (b, which) => {
  const srv = await T.serve({ '/p.html': '<!doctype html><meta charset=utf-8><script>' + SRC + '</script>', '/d.bin': { body: data, type: 'application/octet-stream' } });
  const one = async (mode) => {
    const p = await b.newPage(); await p.goto(srv.base + '/p.html');
    const res = await p.evaluate(async (mode) => {
      const u = new Uint8Array(await (await fetch('/d.bin')).arrayBuffer()); await LfcPack.init(); const t = performance.now(); let f;
      if (mode === 'pack') f = LfcPack.pack(u, { share: false });
      else { const st = LfcPack.packParallelStream({ workers: 3, share: false }); for (let o = 0; o < u.length; o += 65536) st.push(u.subarray(o, Math.min(u.length, o + 65536))); f = await st.finish(); }
      let h = 0; for (let i = 0; i < f.length; i += 61) h = (h * 31 + f[i]) >>> 0; return { ms: performance.now() - t, bytes: f.length, h };
    }, mode); await p.close(); return res;
  };
  await one('pack'); const R = { pack: [], stream: [] };
  for (let i = 0; i < PAIRS; i++) for (const m of (i % 2 ? ['stream', 'pack'] : ['pack', 'stream'])) R[m].push(await one(m));
  const ok = R.pack.every((x, i) => x.bytes === R.stream[i].bytes && x.h === R.stream[i].h && x.bytes === R.pack[0].bytes);
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], mp = med(R.pack.map((x) => x.ms)), ms = med(R.stream.map((x) => x.ms));
  console.log(which, (data.length / 1e6).toFixed(0) + ' MB: pack ' + mp.toFixed(0) + ' ms, packParallelStream (3 workers) ' + ms.toFixed(0) + ' ms, ratio ' + (ms / mp).toFixed(2) + ', same bytes: ' + ok);
  srv.close(); if (!ok) process.exit(1);
});
