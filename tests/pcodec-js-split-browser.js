#!/usr/bin/env node
// pcodec-js 1.4.0 split files in a real browser. Copyright (c) 2026 LFC Foundry. MIT License.
// Exactness: a split file (pack(x, { parts: true })) opens to the same numbers through unpack, unpackAsync, info and the pool, and the parts-only result joins to the same numbers.
// Timing (ms, lower is better; wall time of the call): a column of 0.5, 2 and 8 million numbers, opened as a normal file on one worker, as a split file on a pool of 4 (joined) and as parts only.
// Median of ROUNDS (default 5) rounds, the configurations taking turns. One browser at a time: CHROMIUM=/path/to/chrome node tests/pcodec-js-split-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js. Exit 2 (skipped) when nothing can run. Exit 1 on a failed check.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'pcodec-js', process.env.LIB || 'pcodec-js-pack.js'), 'utf8');
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const ROUNDS = +process.env.ROUNDS || 5;

async function battery(rounds) {
  const med = a => { a = a.slice().sort((x, y) => x - y); return +a[a.length >> 1].toFixed(1); };
  const mk = n => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = Math.round((i % 1000 * 3.7 + Math.sin(i / 50) * 100) * 100) / 100; return a; };
  const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false; return true; };
  const join = parts => { let n = 0, k; for (k = 0; k < parts.length; k++) n += parts[k].length; const o = new Float64Array(n); let off = 0; for (k = 0; k < parts.length; k++) { o.set(parts[k], off); off += parts[k].length; } return o; };
  const out = { checks: {}, rows: [] }, mark = (k, ok) => { out.checks[k] = !!ok; };
  const pc = await PcodecJS.load(), P = await PcodecJS.pool({ size: 4 }), W = await PcodecJS.worker();
  const small = mk(600000), sp = pc.pack(small, { parts: 4 }), np = pc.pack(small);
  mark('split file opens to the same numbers (unpack, unpackAsync, info, worker)', same(pc.unpack(sp), small) && same(await pc.unpackAsync(sp), small) && pc.info(sp).count === small.length && same(await W.unpack(sp), small));
  mark('a split file is only a few bytes bigger than a normal one (' + (sp.length - np.length) + ' B)', sp.length > np.length && sp.length - np.length < 400);
  for (const [label, n] of [['0.5M numbers', 500000], ['2M numbers', 2000000], ['8M numbers', 8000000]]) {
    const a = mk(n), normal = pc.pack(a), split = await P.pack(a, { parts: true });
    const pool1 = await PcodecJS.pool({ size: 1 });
    mark(label + ': split opens equal on the pool, parts join equal, normal file equal', same(await P.unpack(split), a) && same(join(await P.unpack(split, { parts: true })), a) && same(await P.unpack(normal), a));
    const t = { one: [], split: [], parts: [] };
    await W.unpack(normal); await P.unpack(split);
    for (let r = 0; r < rounds; r++) {
      for (const k of (r % 2 ? ['parts', 'split', 'one'] : ['one', 'split', 'parts'])) {
        const t0 = performance.now();
        if (k === 'one') await W.unpack(normal); else if (k === 'split') await P.unpack(split); else await P.unpack(split, { parts: true });
        t[k].push(performance.now() - t0);
      }
    }
    out.rows.push({ label, size: split.length, normalSize: normal.length, one: med(t.one), split: med(t.split), parts: med(t.parts) });
    try { pool1.terminate && pool1.terminate(); } catch (e) { /* ignore */ }
  }
  return out;
}

(async () => {
  let bad = 0;
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><meta charset=utf-8><title>split</title>'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true }) : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
    console.log('Browser: ' + await b.version());
    const p = await b.newPage(); await p.goto('http://127.0.0.1:' + srv.address().port + '/');
    await p.evaluate(src => { (0, eval)(src); }, SRC + '\nwindow.PcodecJS = PcodecJS;');
    const r = await p.evaluate(battery, ROUNDS);
    for (const k of Object.keys(r.checks)) { console.log((r.checks[k] ? '  ok   ' : '  FAIL ') + k); if (!r.checks[k]) bad++; }
    console.log('  ms to open the column (lower is better): normal file on 1 worker / split file on a pool of 4, joined / parts only');
    for (const x of r.rows) console.log('  ' + x.label.padEnd(13) + String(x.one).padStart(7) + ' /' + String(x.split).padStart(7) + ' /' + String(x.parts).padStart(7) + '   (file ' + x.normalSize + ' B normal, ' + x.size + ' B split)');
    await b.close();
  }
  srv.close(); console.log(bad ? bad + ' check(s) failed' : 'all checks passed'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
