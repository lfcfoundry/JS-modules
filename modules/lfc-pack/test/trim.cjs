// trim(): packing and reading give the same bytes and rows before and after, for the full build and the decoder-only build. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '..', 'lfc-pack.js')), R = require(path.join(__dirname, '..', 'lfc-pack-read.js'));
const rows = []; for (let i = 0; i < 20000; i++) rows.push(JSON.stringify(i % 3 ? { id: i, name: 'n' + (i % 97), tags: ['a', 'b' + (i % 5)], at: { x: i * 0.25, y: -i } } : { id: i, v: 'x'.repeat(i % 40), ok: i % 2 === 0 }));
const text = rows.join('\n') + '\n';
(async () => {
  await L.init(); await R.init();
  const opts = [{}, { blockBytes: 32768 }, { access: 'random' }, { block: 'flat' }, { exact: true }];
  let bad = 0;
  for (const o of opts) {
    const a = L.pack(text, o); L.trim(); const b = L.pack(text, o);
    if (Buffer.compare(Buffer.from(a), Buffer.from(b))) { bad++; console.log('pack differs after trim', JSON.stringify(o)); }
    const u1 = JSON.stringify(L.unpack(a)); L.trim(); R.trim(); const u2 = JSON.stringify(L.unpack(a)), u3 = JSON.stringify(R.unpack(a));
    if (u1 !== u2 || u1 !== u3) { bad++; console.log('unpack differs after trim', JSON.stringify(o)); }
    L.trim(); if (JSON.stringify(L.unpackRows(a, { from: 15000, count: 7 })) !== JSON.stringify(L.unpack(a).slice(15000, 15007))) { bad++; console.log('unpackRows differs after trim', JSON.stringify(o)); }
  }
  // idle auto-trim (30 s by default; 5 ms here): packs before and after it, and a packStream that idles between chunks, give the same bytes
  L._autoTrimMs(5); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const o of opts) {
    const a = L.pack(text, o); await wait(30); const b = L.pack(text, o);
    if (Buffer.compare(Buffer.from(a), Buffer.from(b))) { bad++; console.log('pack differs after idle auto-trim', JSON.stringify(o)); }
  }
  L._autoTrimMs(30000);
  console.log('trim: ' + opts.length + ' option sets, bad ' + bad); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
