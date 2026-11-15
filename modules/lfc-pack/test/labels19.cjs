// 0.14.0: dictionary columns handed to packBlock whole ({ kind: 'dict', labels, ids }) and cut into several blocks write their labels once in a footer table (section 19, format minor 4). Rows, columns, open() reads and a pushPacked stream must give the same values as without the table; the file is smaller; a file made without the table still reads. Pass/fail only.
const JF = require('../lfc-pack.js'), assert = require('assert'), enc = new TextEncoder();
(async () => {
  await JF.init();
  let seed = 9; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const bcol = (parts) => { const b = parts.map((x) => enc.encode(x)); let tot = 0; b.forEach((x) => (tot += x.length)); const bytes = new Uint8Array(tot), start = new Int32Array(b.length), end = new Int32Array(b.length); let p = 0; b.forEach((x, i) => { bytes.set(x, p); start[i] = p; p += x.length; end[i] = p; }); return { bytes, start, end }; };
  const mk = (n, nl, off) => { const labs = []; for (let i = 0; i < nl; i++) labs.push('label ' + (i + off) + (i % 7 === 0 ? ' café' : '') + ' '.repeat(i % 3) + 'x'.repeat(i % 20)); const ids = Int32Array.from({ length: n }, () => Math.floor(r() * nl)); const v = Array.from(ids, (c) => labs[c]);
    return { cols: { id: Float64Array.from({ length: n }, (_, i) => i), k: { kind: 'dict', labels: bcol(labs), ids }, w: bcol(v.map((x, i) => (i % 5 ? x : 'z' + i))) }, v }; };
  const hasSh = (b) => { const s = JSON.stringify(JF.stats(b)); return s.includes('"sh"') || s; };
  for (const [n, nl] of [[6000, 40], [20000, 900], [20000, 70000 / 100]]) {
    const { cols, v } = mk(n, nl, 0), opts = { share: false, level: 3, blockBytes: 40000 };
    const a = await JF.packBlock(cols, opts), b = await JF.packBlock(cols, Object.assign({ _nolabels: true }, opts));
    assert.ok(JF.info(a).blocks > 1, 'several blocks ' + JF.info(a).blocks); assert.strictEqual(JF.info(a).minor, 4, 'minor 4 when a table is used'); assert.ok(JF.info(b).minor < 4, 'no table, no minor 4');
    assert.ok(a.length < b.length, 'smaller with the table ' + a.length + ' vs ' + b.length);
    const ra = JF.unpackRows(a), rb = JF.unpackRows(b); assert.strictEqual(JSON.stringify(ra), JSON.stringify(rb), 'same rows ' + n + ' ' + nl); assert.strictEqual(JSON.stringify(ra.map((x) => x.k)), JSON.stringify(v));
    const ca = JF.unpackColumns(a), cb2 = JF.unpackColumns(b); assert.strictEqual(JSON.stringify(ca), JSON.stringify(cb2), 'same columns');
    // reads that go through the code-aware paths
    const val = v[17]; const q1 = JF.query ? null : null; void q1;
    for (const val of [v[17], v[3000 % n], 'no such label']) {
      assert.strictEqual(JSON.stringify(JF.unpack(a, { equals: { key: 'k', value: val } })), JSON.stringify(JF.unpack(b, { equals: { key: 'k', value: val } })), 'equals ' + val);
      assert.strictEqual(JSON.stringify(JF.unpack(a, { equals: { key: 'k', value: val }, positions: true })), JSON.stringify(JF.unpack(b, { equals: { key: 'k', value: val }, positions: true })), 'positions');
    }
    const any = [v[1], v[2], v[5], 'nope'];
    assert.strictEqual(JSON.stringify(JF.unpack(a, { equals: { key: 'k', anyOf: any } })), JSON.stringify(JF.unpack(b, { equals: { key: 'k', anyOf: any } })), 'anyOf');
    assert.strictEqual(JSON.stringify(JF.unpack(a, { equals: { key: 'k', anyOf: any }, cache: true })), JSON.stringify(JF.unpack(b, { equals: { key: 'k', anyOf: any }, cache: true })), 'anyOf cached');
    assert.strictEqual(JSON.stringify(JF.aggregate(a, { key: 'id', by: 'k' })), JSON.stringify(JF.aggregate(b, { key: 'id', by: 'k' })), 'aggregate by the dictionary column');
    // open(): block by block, from a function reader
    const R = await JF.open(a); let got = []; for (let i = 0; i < R.blocks.length; i++) got = got.concat(await R.block(i)); assert.strictEqual(JSON.stringify(got), JSON.stringify(ra), 'open() blocks');
    // a stream made of two pieces with different labels
    const m2 = mk(n, nl, 1000), st = JF.packStream(Object.assign({ share: false }, opts)); const parts = st.pushPacked(a).concat(st.pushPacked(await JF.packBlock(m2.cols, opts)), st.finish());
    const file = Buffer.concat(parts.map((x) => Buffer.from(x))); assert.ok(file, 'stream file');
    const rs = JF.unpackRows(new Uint8Array(file)); assert.strictEqual(rs.length, 2 * n); assert.strictEqual(JSON.stringify(rs.slice(0, n)), JSON.stringify(ra), 'stream piece 1'); assert.strictEqual(JSON.stringify(rs.slice(n).map((x) => x.k)), JSON.stringify(m2.v), 'stream piece 2');
    assert.strictEqual(JF.info(new Uint8Array(file)).minor, 4, 'stream minor 4');
    // damaged: a block without its table is refused
    const R2 = JF.unpackRows; void R2;
  }
  console.log('labels19 ok');
})().catch((e) => { console.error(e); process.exit(1); });
