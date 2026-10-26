#!/usr/bin/env node
// json-format in one real browser at a time: value-exact round trips (edge cases, generated rows) and timings of pack and unpack against JSON.parse, behind the noise guard. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/json-format-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS=7 (rounds), ROWS=40000 (generated rows per set), BASELINE=1 to skip the noise guard
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/json-format/json-format.js'), 'utf8'), cases = require('../modules/json-format/test/cases.js');
const REPS = +process.env.REPS || 7, ROWS = +process.env.ROWS || 40000;
async function pageWork(reps, rows, cases) {
  const J = window.JsonFormat; await J.init();
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
  return out;
}
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' });
  const run = async () => { const p = await b.newPage(); await p.goto(srv.base + '/page.html'); try { return await p.evaluate('(' + pageWork.toString() + ')(' + REPS + ',' + ROWS + ',' + JSON.stringify(cases) + ')'); } finally { await p.close().catch(() => {}); } };
  const g = process.env.BASELINE ? { ok: true, result: await run(), calibrations: [] } : await T.guarded(b, which, run);
  srv.close();
  if (!g.ok) { console.log('NOISY: every try was off the quiet baseline; nothing published'); return false; }
  const r = g.result; console.log('sizes ' + JSON.stringify(r.sizes) + '; noise guard tries ' + (g.tries || 0));
  console.log(T.table(Object.entries(r.times).map(([n, t]) => ({ name: n, pack: t.packMs.toFixed(0), unpack: t.unpackMs.toFixed(0), parse: t.jsonParseMs.toFixed(0) })), [{ key: 'name', title: 'set', align: 'left' }, { key: 'pack', title: 'pack ms' }, { key: 'unpack', title: 'unpack ms' }, { key: 'parse', title: 'JSON.parse ms' }]));
  if (r.bad.length) { console.log('FAIL ' + r.bad.slice(0, 10).join('; ')); return false; }
  console.log('all round trips value-exact'); if (outFile) fs.writeFileSync(outFile, JSON.stringify(r, null, 1)); return true;
});
