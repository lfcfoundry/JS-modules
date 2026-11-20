// Copyright (c) 2026 LFC Foundry. MIT License.
// Timestamp columns: the row previews of a packBlock call format 256 values at a time; the packed bytes equal the bytes of the same times given as text, for lengths around 256 and 1,024, and an out-of-range value still reports its own index. Run: node modules/lfc-pack/test/tspreview.cjs
'use strict';
const JF = require('../lfc-pack.js'), crypto = require('crypto');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);
const pad2 = (x) => String(x).padStart(2, '0');
const txt = (s) => { const d = new Date(s * 1000); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()); };
(async () => {
  await JF.init(); let bad = 0, cases = 0; const o = { level: 3, blockBytes: 2097152, share: false };
  for (const n of [1, 2, 255, 256, 257, 511, 1023, 1024, 1025, 5000]) for (const nan of [false, true]) {
    const v = new Float64Array(n); let t = 1767261600; for (let i = 0; i < n; i++) v[i] = t += 1 + (i * 7919 % 40);
    if (nan && n > 3) v[3] = NaN;
    const text = Array.from(v, (x) => (x === x ? txt(x) : null)); cases++;
    const a = sha(await JF.packBlock({ k: { kind: 'ts', unit: 's', values: v, fmt: 'YYYY-MM-DD HH:MM:SS' }, j: v.slice() }, o)), b = sha(await JF.packBlock({ k: text, j: v.slice() }, o));
    if (a !== b) { bad++; console.log('DIFF n=' + n + ' nan=' + nan + ' ' + a + ' ' + b); }
  }
  for (const at of [0, 255, 256, 700, 1500]) { const v = new Float64Array(2000); for (let i = 0; i < 2000; i++) v[i] = 1767261600 + i; v[at] = 1e15; let msg = ''; try { await JF.packBlock({ k: { kind: 'ts', unit: 's', values: v, fmt: 'YYYY-MM-DD HH:MM:SS' } }, o); } catch (e) { msg = e.message; } if (!msg.includes('value ' + at + ' ')) { bad++; console.log('FAIL error index ' + at + ': ' + msg); } }
  console.log((bad ? 'FAIL' : 'ok  ') + ' timestamp previews: ' + cases + ' cases, bad ' + bad);
  process.exitCode = bad ? 1 : 0; if (JF.close) JF.close();
})().catch((e) => { console.error(e); process.exit(1); });
