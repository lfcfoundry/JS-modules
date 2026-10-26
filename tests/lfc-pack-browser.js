#!/usr/bin/env node
// lfc-pack in one real browser at a time: value-exact round trips (edge cases, generated rows) and timings of pack and unpack against JSON.parse, behind the noise guard. Copyright (c) 2026 LFC Foundry. MIT License.
// With FILE=path.ndjson it also packs that file and reads it back with 1, 2, 4 and all helper workers (the real-file scaling table).
// Run: node tests/lfc-pack-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS=7 (rounds), ROWS=40000 (generated rows per set), BASELINE=1 to skip the noise guard
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8'), cases = require('../modules/lfc-pack/test/cases.js');
const FILE = process.env.FILE || '', REPS = +process.env.REPS || 7, ROWS = +process.env.ROWS || 40000;
async function pageWork(reps, rows, cases, haveFile) {
  const J = window.LfcPack; await J.init();
  let seed = 7; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296, pick = (a) => a[Math.floor(r() * a.length)];
  const out = { bad: [], sizes: {}, times: {} };
  const same = (a, b) => { const sa = JSON.stringify(a), sb = JSON.stringify(b); if (sa === sb) return true; const ka = (o) => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((m, x) => (m[x] = v[x], m), {}) : v); return ka(a) === ka(b); };
  const check = (name, text) => { const want = text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); for (const block of [undefined, 'nested', 'flat']) { let got; try { got = J.unpack(J.pack(text, { block })); } catch (e) { out.bad.push(name + '/' + block + ': ' + e.message); continue; } if (got.length !== want.length) { out.bad.push(name + '/' + block + ': row count'); continue; } for (let i = 0; i < want.length; i++) if (!same(got[i], want[i])) { out.bad.push(name + '/' + block + ': row ' + i); break; } } };
  for (const [name, text] of cases) { if (text.length > 3000) continue; check(name, text); }
  const lv = ['INFO', 'WARN', 'ERROR', 'DEBUG'], logs = [], ev = [];
  for (let i = 0; i < rows; i++) logs.push(JSON.stringify({ ts: 1760000000 + i * 3 + Math.floor(r() * 3), level: pick(lv), status: pick([200, 200, 200, 404, 500]), ms: Math.round(r() * 5000) / 100, id: Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join(''), ip: Math.floor(r() * 256) + '.' + Math.floor(r() * 256) + '.0.1', msg: 'request ' + Math.floor(r() * 1e6) + ' from host-' + Math.floor(r() * 99) + ' took ' + Math.floor(r() * 900) + ' ms' }));
  for (let i = 0; i < rows / 4; i++) ev.push(JSON.stringify({ id: i, type: pick(['push', 'pull', 'fork', 'watch']), actor: { id: Math.floor(r() * 5000), login: 'user' + Math.floor(r() * 5000) }, repo: { id: Math.floor(r() * 900), name: 'org/repo' + Math.floor(r() * 900) }, payload: r() < 0.5 ? { size: Math.floor(r() * 9), commits: Array.from({ length: Math.floor(r() * 4) }, () => ({ sha: Math.floor(r() * 1e9).toString(16), msg: 'fix ' + Math.floor(r() * 99) })) } : { action: pick(['opened', 'closed']) }, public: r() < 0.9 }));
  const sets = { logs: logs.join('\n') + '\n', events: ev.join('\n') + '\n' };
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  for (const [name, text] of Object.entries(sets)) {
    check(name, text);
    const blob = J.pack(text), tp = [], tr = [], tj = []; out.sizes[name] = { input: text.length, packed: blob.length };
    for (let k = 0; k < reps; k++) {
      let t = performance.now(); J.pack(text); tp.push(performance.now() - t);
      t = performance.now(); J.unpack(blob); tr.push(performance.now() - t);
      t = performance.now(); text.split('\n').filter(Boolean).map((l) => JSON.parse(l)); tj.push(performance.now() - t);
    }
    out.times[name] = { packMs: med(tp), unpackMs: med(tr), jsonParseMs: med(tj) };
  }
  if (haveFile) {
    const buf = new Uint8Array(await (await fetch('/data.ndjson')).arrayBuffer()); out.file = { input: buf.length };
    let t = performance.now(); const packed = J.pack(buf); out.file.packMs = performance.now() - t; out.file.packed = packed.length;
    t = performance.now(); const single = J.unpack(packed); out.file.unpackMs = performance.now() - t;
    t = performance.now(); const text = new TextDecoder().decode(buf).split('\n').filter(Boolean).map((l) => JSON.parse(l)); out.file.jsonParseMs = performance.now() - t;
    if (single.length !== text.length) out.bad.push('file: row count'); else for (let i = 0; i < single.length; i += 97) if (!same(single[i], text[i])) { out.bad.push('file: row ' + i); break; }
    out.file.pool = {}; const hc = navigator.hardwareConcurrency; out.file.cores = hc;
    for (const w of [1, 2, 4, Math.max(3, hc - 1)]) {
      if (out.file.pool[w]) continue; const pool = await J.pool({ workers: w }); await pool.unpack(packed); const T = [];
      for (let k = 0; k < Math.min(reps, 3); k++) { const t0 = performance.now(); const r = await pool.unpack(packed); T.push(performance.now() - t0); if (k === 0 && (r.length !== single.length || !same(r[r.length - 1], single[single.length - 1]))) out.bad.push('pool ' + w + ': differs'); }
      out.file.pool[w] = med(T); pool.close();
    }
  }
  return out;
}
T.main(async (b, which, outFile) => {
  const routes = { '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' };
  if (FILE) routes['/data.ndjson'] = fs.readFileSync(FILE);
  const srv = await T.serve(routes);
  const run = async () => { const p = await b.newPage(); await p.goto(srv.base + '/page.html'); try { return await p.evaluate('(' + pageWork.toString() + ')(' + REPS + ',' + ROWS + ',' + JSON.stringify(cases) + ',' + !!FILE + ')'); } finally { await p.close().catch(() => {}); } };
  const g = process.env.BASELINE ? { ok: true, result: await run(), calibrations: [] } : await T.guarded(b, which, run);
  srv.close();
  if (!g.ok) { console.log('NOISY: every try was off the quiet baseline; nothing published'); return false; }
  const r = g.result; console.log('sizes ' + JSON.stringify(r.sizes) + '; noise guard tries ' + (g.tries || 0));
  console.log(T.table(Object.entries(r.times).map(([n, t]) => ({ name: n, pack: t.packMs.toFixed(0), unpack: t.unpackMs.toFixed(0), parse: t.jsonParseMs.toFixed(0) })), [{ key: 'name', title: 'set', align: 'left' }, { key: 'pack', title: 'pack ms' }, { key: 'unpack', title: 'unpack ms' }, { key: 'parse', title: 'JSON.parse ms' }]));
  if (r.file) { const f = r.file; console.log('file ' + FILE.split('/').pop() + ': ' + f.input + ' -> ' + f.packed + ' bytes; pack ' + f.packMs.toFixed(0) + ' ms; unpack one thread ' + f.unpackMs.toFixed(0) + ' ms; JSON.parse ' + f.jsonParseMs.toFixed(0) + ' ms; ' + f.cores + ' cores; helper workers (ms): ' + JSON.stringify(f.pool)); }
  if (r.bad.length) { console.log('FAIL ' + r.bad.slice(0, 10).join('; ')); return false; }
  console.log('all round trips value-exact'); if (outFile) fs.writeFileSync(outFile, JSON.stringify(r, null, 1)); return true;
});
