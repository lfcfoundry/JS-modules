#!/usr/bin/env node
// text-columns 0.6.0 parseParallel(File or Blob): each helper reads its own piece of the file (idea A) against the page reading the whole file first (0.5.2, _file: false),
// each alone and stacked with the one-string text of 0.5.2 (idea B, _utf16: false turns it off). Same answers as parse() first, then wall time, the page's own work and its longest stall.
// Run: node tests/text-columns-file-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (default 7), FILES (JSON list of [kind, MB])
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 7);
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/tc.js': fs.readFileSync(root + 'text-columns/text-columns.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/tc.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate(() => {
    const enc = new TextEncoder();
    window.make = (kind, mb) => {
      let s = 7; const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
      const words = ['north', 'south', 'east', 'west', 'harbor', 'mill', 'ridge', 'creek', kind === 'accented' ? 'Zoë' : kind === 'emoji' ? 'sun🌞' : 'Zoe', 'field'], parts = [kind === 'num' ? 'a,b,c,d,e,f,g,h\n' : 'id,name,city,x,y,note,z\n'];
      let bytes = 0;
      while (bytes < mb * 1e6) {
        const lines = [];
        for (let i = 0; i < 2000; i++) lines.push(kind === 'num' ? [(rnd() * 1e6 | 0), (rnd() * 1000).toFixed(3), (rnd() * 100 - 50).toFixed(2), (rnd() * 9 | 0), (rnd() * 1e5).toFixed(1), (rnd() * 2).toFixed(4), (rnd() * 3e4 | 0), (rnd() * 77).toFixed(2)].join(',')
          : (rnd() * 1e7 | 0) + ',' + words[rnd() * 10 | 0] + ' ' + words[rnd() * 10 | 0] + ',' + words[rnd() * 10 | 0] + 'ville,' + (rnd() * 1000).toFixed(3) + ',' + (rnd() * 90).toFixed(4) + ',note ' + (rnd() * 1e6 | 0) + ' of ' + words[rnd() * 10 | 0] + ',' + (rnd() * 5e3 | 0));
        const L = lines.join('\n') + '\n'; parts.push(L); bytes += L.length;
      }
      return enc.encode(parts.join(''));
    };
    window.same = (A, B) => {
      if (!A || !B || A.count !== B.count || A.columns.length !== B.columns.length) return 'count/columns';
      for (let j = 0; j < A.columns.length; j++) { const x = A.columns[j].values, y = B.columns[j].values; if (A.columns[j].type !== B.columns[j].type || x.length !== y.length) return 'type col ' + j; for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && !(x[i] !== x[i] && y[i] !== y[i])) return 'col ' + j + ' row ' + i + ': ' + JSON.stringify(x[i]) + ' vs ' + JSON.stringify(y[i]); }
      return true;
    };
  });
  const same = await p.evaluate(async () => {
    TextColumns.warm(4);
    const enc = new TextEncoder(), out = {}, rows = (f, n) => Array.from({ length: n }, (_, i) => f(i)).join('\n') + '\n';
    const cases = {
      accented: enc.encode('a,b\n' + rows((i) => i + ',Zoë ' + i, 4000)),
      emoji: enc.encode('a,b,c\n' + rows((i) => i + ',x🌞y' + i + ',é' + (i % 7), 4000)),
      quotes: enc.encode('a,b,c\n' + rows((i) => i + ',"Zoë, ""the"" ' + i + '",' + (i % 3 ? 'plain' : '"q🌞"'), 4000)),
      quotedLineBreaks: enc.encode('a,b\n' + rows((i) => i + ',"line one\nline two ' + i + '\nthree"', 4000)),   // most cuts fall inside a quoted field: read again the 0.5.2 way
      unclosedQuote: enc.encode('a,b\n' + rows((i) => i + ',x' + i, 3000) + '1,"never closed\n' + rows((i) => i + ',y', 1000)),
      crlf: enc.encode('a,b\r\n' + Array.from({ length: 4000 }, (_, i) => i + ',ñ' + i).join('\r\n') + '\r\n'),
      bom: enc.encode('﻿a,b\n' + rows((i) => i + ',Zoë' + i, 4000)),
      noFinalLineEnd: enc.encode('a,b\n' + rows((i) => i + ',w' + i, 4000) + '9,last'),
      fewLines: enc.encode('a,b\n1,x\n2,y\n'),
      oneLongLine: enc.encode('a,b\n' + '1,' + 'z'.repeat(300000) + '\n2,q\n'),
      ragged: enc.encode('a,b\n' + rows((i) => i === 3900 ? '1,2,3' : i + ',r', 4000)),
      mixAcross: enc.encode('a,b\n' + rows((i) => i + ',' + (i < 3500 ? i * 2 : 'Zoë' + i), 4000)),
      mixAcrossAscii: enc.encode('a,b\n' + rows((i) => i + ',' + (i < 3500 ? i * 2 : 'zoe' + i), 4000)),
      badUtf8: (() => { const a = enc.encode('a,b\n' + rows((i) => i + ',Zoë' + i, 4000)); a[a.length - 40] = 0xFF; return a; })(),
      ascii: enc.encode('a,b\n' + rows((i) => i + ',plain' + i, 4000)),
      numbers: enc.encode('a,b\n' + rows((i) => i + ',' + i * 0.5, 4000))
    };
    for (const [name, u] of Object.entries(cases)) for (const o of [{}, { columns: ['b'] }, { columns: [1] }, { lazy: true }, { header: false }, { types: { a: 'boolean' } }]) {
      let ref; try { ref = TextColumns.parse(u, o); } catch (e) { ref = 'error: ' + e.message; }
      for (const m of [{}, { _utf16: false }, { workers: 3 }, { workers: 7 }]) {
        let r, ok; try { r = await TextColumns.parseParallel(new Blob([u]), Object.assign({ minBytes: 0 }, o, m)); ok = typeof ref === 'string' ? 'no error, expected ' + ref : same(r, ref); } catch (e) { r = { workers: '?' }; ok = typeof ref === 'string' && ref === 'error: ' + e.message ? true : 'error: ' + e.message; }
        if (ok === true && r && r.columns && o.lazy) { ok = same(r, ref); }
        out[name + ' ' + JSON.stringify(o) + ' ' + JSON.stringify(m) + ' (' + r.workers + ' helpers)'] = ok;
      }
    }
    return out;
  });
  const bad = Object.entries(same).filter(([, v]) => v !== true);
  console.log('same answers: ' + Object.keys(same).length + ' cases, differ: ' + (bad.length ? bad.slice(0, 6).map((x) => x.join(': ')).join('; ') : 'none'));
  if (process.env.SAME_ONLY) { srv.close(); return bad.length === 0; }
  const rows = [];
  for (const [kind, mb] of (process.env.FILES ? JSON.parse(process.env.FILES) : [['num', 45], ['mixed', 32], ['accented', 32]])) {
    await p.evaluate((k, m) => { window.B = new Blob([make(k, m)]); }, kind, mb);
    const MODES = { '1 thread': null, '0.5.1 way (neither)': { _file: false, _utf16: false }, 'A alone (File)': { _utf16: false }, '0.5.2 (B alone)': { _file: false }, '0.6.0 (A + B)': {} };
    const names = Object.keys(MODES), ms = {}, page = {}, stall = {};
    for (const k of names) { ms[k] = []; page[k] = []; stall[k] = []; }
    for (let r = 0; r < REPS + 1; r++) for (const k of (r % 2 ? names.slice().reverse() : names)) {
      const v = await p.evaluate(async (o) => {
        // the longest stretch the page could not respond: a timer every 1 ms, the longest gap between ticks
        let last = performance.now(), worst = 0, on = true; const tick = () => { const n = performance.now(); if (n - last > worst) worst = n - last; last = n; if (on) setTimeout(tick, 1); }; setTimeout(tick, 1);
        await new Promise((ok) => setTimeout(ok, 5)); worst = 0; last = performance.now();
        const Tm = {}, t0 = performance.now(); let pg;
        if (!o) { TextColumns.parse(new Uint8Array(await B.arrayBuffer())); pg = performance.now() - t0; }
        else { await TextColumns.parseParallel(B, Object.assign({ minBytes: 0, _timing: Tm }, o)); pg = Tm.post + (Tm.merge - Tm.wait); }
        const wall = performance.now() - t0; on = false; const g = performance.now() - last; if (g > worst) worst = g;
        return [wall, pg, worst];
      }, MODES[k]);
      if (r) { ms[k].push(v[0]); page[k].push(v[1]); stall[k].push(v[2]); }
    }
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    for (const k of names) rows.push({ file: kind + ' ' + mb + ' MB', mode: k, ms: med(ms[k]).toFixed(1), page: med(page[k]).toFixed(1), stall: med(stall[k]).toFixed(1), vs: (med(ms['0.5.2 (B alone)']) / med(ms[k])).toFixed(2) });
  }
  srv.close();
  console.log(T.table(rows, [{ key: 'file', title: 'file (a Blob)', align: 'left' }, { key: 'mode', title: 'mode', align: 'left' }, { key: 'ms', title: 'wall ms' }, { key: 'page', title: 'page ms' }, { key: 'stall', title: 'longest stall ms' }, { key: 'vs', title: 'x faster than 0.5.2' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, same, rows }));
  return bad.length === 0;
});
