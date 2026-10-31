#!/usr/bin/env node
// text-columns parseParallel: helpers send each piece's text as one string plus UTF-16 positions (0.6.0) against the byte positions of 0.5.1 (_utf16: false).
// Same answers as parse() first (accents, emoji, quotes, CRLF, columns, lazy, number/text mix across pieces, a piece that is not valid UTF-8), then wall time and the page's own work.
// Run: node tests/text-columns-utf16-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (default 7)
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
      crlf: enc.encode('a,b\r\n' + Array.from({ length: 4000 }, (_, i) => i + ',ñ' + i).join('\r\n') + '\r\n'),
      mixAcross: enc.encode('a,b\n' + rows((i) => i + ',' + (i < 3500 ? i * 2 : 'Zoë' + i), 4000)),   // column b is numbers in the early pieces and text in the last
      badUtf8: (() => { const a = enc.encode('a,b\n' + rows((i) => i + ',Zoë' + i, 4000)); a[a.length - 40] = 0xFF; return a; })(),
      ascii: enc.encode('a,b\n' + rows((i) => i + ',plain' + i, 4000))
    };
    for (const [name, u] of Object.entries(cases)) for (const o of [{}, { columns: ['b'] }, { lazy: true }, { header: false }]) {
      const ref = TextColumns.parse(u, o);
      for (const m of [{}, { _utf16: false }]) {
        const r = await TextColumns.parseParallel(u, Object.assign({ minBytes: 0 }, o, m));
        const ok = same(r, ref); out[name + ' ' + JSON.stringify(o) + (m._utf16 === false ? ' 0.5.1 way' : '') + ' (' + r.workers + ' helpers)'] = ok;
      }
    }
    return out;
  });
  const bad = Object.entries(same).filter(([, v]) => v !== true);
  console.log('same answers: ' + Object.keys(same).length + ' cases, differ: ' + (bad.length ? bad.slice(0, 6).map((x) => x.join(': ')).join('; ') : 'none'));
  const rows = [];
  for (const [kind, mb] of (process.env.FILES ? JSON.parse(process.env.FILES) : [['num', 45], ['mixed', 32], ['accented', 32]])) {
    await p.evaluate((k, m) => { window.U = make(k, m); }, kind, mb);
    const names = ['1 thread', '0.5.1 way', '0.6.0'], ms = {}, page = {};
    for (const k of names) { ms[k] = []; page[k] = []; }
    for (let r = 0; r < REPS + 1; r++) for (const k of (r % 2 ? names.slice().reverse() : names)) {
      const v = await p.evaluate(async (k) => { const Tm = {}, t0 = performance.now(); if (k === '1 thread') { TextColumns.parse(U); const d = performance.now() - t0; return [d, d]; } await TextColumns.parseParallel(U, { minBytes: 0, _timing: Tm, _utf16: k === '0.6.0' ? undefined : false }); return [performance.now() - t0, Tm.post + (Tm.merge - Tm.wait)]; }, k);
      if (r) { ms[k].push(v[0]); page[k].push(v[1]); }
    }
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    for (const k of names) rows.push({ file: kind + ' ' + mb + ' MB', mode: k, ms: med(ms[k]).toFixed(1), page: med(page[k]).toFixed(1), vs: (med(ms['0.5.1 way']) / med(ms[k])).toFixed(2) });
  }
  srv.close();
  console.log(T.table(rows, [{ key: 'file', title: 'file', align: 'left' }, { key: 'mode', title: 'mode', align: 'left' }, { key: 'ms', title: 'wall ms' }, { key: 'page', title: 'page ms' }, { key: 'vs', title: 'x faster than 0.5.1 way' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, same, rows }));
  return bad.length === 0;
});
