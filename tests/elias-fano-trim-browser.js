#!/usr/bin/env node
// elias-fano trim() and autoTrim() in a real browser: runs modules/elias-fano/test/trim.js in the page (same checks as in Node), then times 200,000 get calls on a list before and after it was moved by trim().
// Run: node tests/elias-fano-trim-browser.js <chromium|firefox|webkit> [out.json]
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const mod = path.resolve(__dirname, '..') + '/modules/elias-fano/';
const shim = "window.process = { exit: function (c) { window.__exit = c; } }; window.require = function (n) { if (/elias-fano/.test(n)) return EliasFano; return { ok: function (v, m) { if (!v) throw new Error(m || 'not ok'); }, strictEqual: function (a, b, m) { if (a !== b) throw new Error((m || 'differ') + ': ' + String(a).slice(0, 80) + ' vs ' + String(b).slice(0, 80)); } }; };" +
  "window.__log = []; var _l = console.log, _e = console.error; console.log = function (s) { __log.push(String(s)); _l.apply(console, arguments); }; console.error = function (s) { __log.push('ERROR ' + (s && s.stack || s)); _e.apply(console, arguments); };";
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/ef.js': fs.readFileSync(mod + 'elias-fano.js', 'utf8'), '/shim.js': shim, '/t.js': fs.readFileSync(mod + 'test/trim.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/ef.js"></script><script src="/shim.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate(() => new Promise((ok) => { const s = document.createElement('script'); s.src = '/t.js'; document.head.appendChild(s); const w = () => (window.__log.some((x) => /all checks passed|ERROR/.test(x)) || window.__exit) ? ok() : setTimeout(w, 50); w(); }));
  const log = await p.evaluate(() => window.__log);
  console.log(log.join('\n'));
  const speed = await p.evaluate(async () => {
    const EF = EliasFano; let s = 3; const v = new Uint32Array(1000000); let x = 0; for (let i = 0; i < v.length; i++) { x += 1 + ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) % 40); v[i] = x; }
    const L = EF.open(EF.build(v)); L.get(0); L.compact();
    const idx = new Uint32Array(200000); for (let i = 0; i < idx.length; i++) idx[i] = (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) % v.length;
    const run = () => { const t0 = performance.now(); let sum = 0; for (let i = 0; i < idx.length; i++) sum += L.get(idx[i]); window.sink = sum; return performance.now() - t0; };
    const med = (a) => a.sort((p, q) => p - q)[a.length >> 1], a = [], c = [];
    for (let i = 0; i < 9; i++) a.push(run());
    const t0 = performance.now(), tr = EF.trim(), trimMs = performance.now() - t0;
    for (let i = 0; i < 9; i++) c.push(run());
    return { before: med(a), after: med(c), trimMs, moved: tr.moved };
  });
  console.log('200,000 get on a compacted 1M list: ' + speed.before.toFixed(1) + ' ms before trim, ' + speed.after.toFixed(1) + ' ms after (moved ' + speed.moved + ', trim ' + speed.trimMs.toFixed(1) + ' ms)');
  srv.close();
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, log, speed }));
  return log.some((x) => /all checks passed/.test(x)) && !log.some((x) => /ERROR/.test(x));
});
