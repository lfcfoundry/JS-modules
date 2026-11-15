// Copyright (c) 2026 LFC Foundry. MIT License.
// B72/B73: a date column given as bytes that cannot pass the more-than-half rule is refused without a full parse (same bytes as before), and the UTF-8 check of a dictionary column looks at the distinct values only (same error text).
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  const o = { level: 3, blockBytes: 2097152, share: false }, enc = new TextEncoder();
  const col = (parts) => { let tot = 0, k; for (k = 0; k < parts.length; k++) tot += parts[k].length; const bytes = new Uint8Array(tot), start = new Int32Array(parts.length), end = new Int32Array(parts.length); let p = 0; parts.forEach((x, i) => { start[i] = p; bytes.set(x, p); p += x.length; end[i] = p; }); return { bytes, start, end }; };
  const iso = (t) => new Date(t).toISOString().slice(0, 19);
  const hasW = (b) => JF.stats(b).some((x) => (x.keys || []).some((k) => k.type === 'W'));
  let seed = 5; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  // 15 distinct dates, 34,000 rows: not a date-number column, reads back as text
  const low = Array.from({ length: 34000 }, () => iso(Date.UTC(2026, 10, 1 + Math.floor(r() * 15), 12, 0, 0)));
  const b1 = await JF.packBlock({ k: col(low.map((s) => enc.encode(s))) }, o);
  assert.ok(!hasW(b1), 'low-distinct dates stay text');
  // sorted dates, 46% distinct: stays text
  let t = Date.UTC(2026, 10, 14, 23, 59, 0); const srt = []; for (let i = 0; i < 34000; i++) { if (r() < 0.46) t -= 60000 * (1 + Math.floor(r() * 3)); srt.push(iso(t)); }
  assert.ok(!hasW(await JF.packBlock({ k: col(srt.map((s) => enc.encode(s))) }, o)), 'sorted 46% distinct dates stay text');
  // 90% distinct: still stored as numbers, and reads back exactly
  const hi = Array.from({ length: 20000 }, () => iso(Date.UTC(2026, 0, 1) + Math.floor(r() * 3e10)));
  const b3 = await JF.packBlock({ k: col(hi.map((s) => enc.encode(s))) }, o);
  assert.ok(hasW(b3), 'high-distinct dates become numbers');
  // UTF-8 check: an invalid value in a dictionary column and in a unique column both refuse with the same text
  const bad = (mk) => Array.from({ length: 3000 }, (_, i) => mk(i));
  for (const parts of [bad((i) => (i % 3 === 2 ? new Uint8Array([0xc3, 0x28, 65]) : new Uint8Array([65 + (i % 3), 0xc3, 0xa9]))), bad((i) => (i === 50 ? new Uint8Array([0xff, 0xfe]) : enc.encode('é' + i + 'x' + i * 7)))]) {
    let msg = ''; try { await JF.packBlock({ k: col(parts) }, o); } catch (e) { msg = e.message; }
    assert.strictEqual(msg, 'LfcPack: text column "k" is not valid UTF-8');
  }
  console.log('bytecol B72/B73 ok');
})().catch((e) => { console.error(e); process.exit(1); });
