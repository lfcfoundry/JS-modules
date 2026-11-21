// 0.14.5: the block-size estimate for a column table (text as bytes, dictionary, Float64Array) must cut blocks where the string-array form does
const L = require('../lfc-pack.js'), enc = new TextEncoder();
let seed = 5; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const al = ['a', 'b', '"', '\\', '\n', '\t', 'é', '中', '\u{1F600}', '\x01', '\x1f', ' ', 'zz', '/'];
const rs = () => { let n = Math.floor(r() * 30), s = ''; for (let i = 0; i < n; i++) s += al[Math.floor(r() * al.length)]; return s; };
function bcol(strs) { const bs = strs.map(s => enc.encode(s)); let t = 0; bs.forEach(b => t += b.length); const bytes = new Uint8Array(t), st = new Int32Array(bs.length), en = new Int32Array(bs.length); let o = 0; bs.forEach((b, i) => { st[i] = o; bytes.set(b, o); o += b.length; en[i] = o; }); return { bytes, start: st, end: en }; }
(async () => { await L.init(); let bad = 0, n = 0;
  for (const [rows, bb] of [[60000, 2097152], [120000, 4194304], [60000, 1500000], [5000, 65536]]) {
    const strs = {}, cols = {};
    for (let c = 0; c < 5; c++) { strs['k"' + c + 'é'] = Array.from({ length: rows }, rs); cols['k"' + c + 'é'] = bcol(strs['k"' + c + 'é']); }
    const nums = Float64Array.from({ length: rows }, (_, i) => i % 7 === 0 ? NaN : Math.round(r() * 1e5) / 100);
    strs.num = Array.from(nums, v => v !== v ? null : v); cols.num = nums;
    const o = { level: 3, blockBytes: bb, share: false };
    // the array form is not in the estimate's fast path, so its blocks are cut by JSON.stringify
    const a = await L.packBlock(strs, o), b = await L.packBlock(cols, o); n++;
    if (Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0) { bad++; console.log('DIFF', rows, bb, a.length, b.length); }
  }
  console.log(bad ? 'FAIL ' + bad + ' of ' + n : 'ok: ' + n + ' cases, same bytes'); process.exit(bad ? 1 : 0); })();
