// Copyright (c) 2026 LFC Foundry. MIT License.
// Since 0.8.2: UUID columns are converted with char codes, and each column's layout is chosen from a sample (close calls compressed in full). Same file format: rows come back exact, and files stay smaller than plain zstd.
const JF = require('../lfc-pack.js'), assert = require('assert'), zlib = require('zlib');
let s = 5; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const hx = (n) => { let o = ''; for (let i = 0; i < n; i++) o += '0123456789abcdef'[(r() * 16) | 0]; return o; };
const uuid = () => hx(8) + '-' + hx(4) + '-' + hx(4) + '-' + hx(4) + '-' + hx(12);
const check = (name, rows, opts) => {
  const text = rows.map((x) => JSON.stringify(x)).join('\n'), p = JF.pack(text, opts), back = JF.unpack(p);
  assert.strictEqual(back.length, rows.length, name + ': row count');
  for (let i = 0; i < rows.length; i += 1 + (rows.length >> 9)) assert.deepStrictEqual(back[i], rows[i], name + ': row ' + i);
  assert.deepStrictEqual(back[rows.length - 1], rows[rows.length - 1], name + ': last row');
  if (zlib.zstdCompressSync && rows.length >= 1000) assert.ok(p.length <= zlib.zstdCompressSync(Buffer.from(text)).length, name + ': not larger than plain zstd');
  return p.length;
};
(async () => {
  await JF.init();
  const edge = ['00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '0123456789abcdef'.slice(0, 8) + '-9999-aaaa-bbbb-ccccddddeeee', '09afaf09-af09-af09-af09-af09af09af09'];
  check('uuid edge', edge.map((u, i) => ({ id: u, n: i })));
  for (const blk of [undefined, 'flat']) {
    check('uuid 20000 ' + blk, Array.from({ length: 20000 }, (_, i) => ({ id: uuid(), n: i, sid: i % 5 ? uuid() : edge[i % 4] })), blk && { block: blk });
    const t = 1760000000000; let v = 20;
    check('sensors 120000 ' + blk, Array.from({ length: 120000 }, (_, i) => ({ ts: t + i * 1000, dev: 'd' + (i % 40), temp: +(v += (r() - .5) * .2).toFixed(2), hum: +(50 + r() * 10).toFixed(1), n: (r() * 100000) | 0 })), blk && { block: blk });
    check('logs 120000 ' + blk, Array.from({ length: 120000 }, (_, i) => ({ ts: t + i * 37, lvl: ['info', 'warn', 'error'][i % 3], ms: (r() * 900) | 0, path: '/api/v' + (i % 3) + '/item/' + ((r() * 500) | 0), id: hx(8) })), blk && { block: blk });
    check('close call 70000 ' + blk, Array.from({ length: 70000 }, (_, i) => ({ a: i % 1000, b: (i * 7) % 1000, c: i, d: 'k' + (i % 3) })), blk && { block: blk });
  }
  console.log('ok sampled layout choice and uuid columns');
})().catch((e) => { console.error(e); process.exit(1); });
