// Copyright (c) 2026 LFC Foundry. MIT License.
// LfcPack.open(src): block-at-a-time reads from a Blob or a read(offset, length) function give the same rows as unpackRows, read only the blocks they need, and catch damage. Pass/fail only. Run: node modules/lfc-pack/test/open.cjs
'use strict';
const JF = require('../lfc-pack.js');
(async () => {
  await JF.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const rows = Array.from({ length: 30000 }, (_, i) => ({ id: i, name: 'n' + (i % 977), v: i * 0.5, tag: i % 3 ? 'a' : '', deep: i % 5 ? { x: i, y: [i % 7, 'q'] } : null }));
  const text = Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const files = [
    ['default', JF.pack(text, { blockBytes: 65536 })],
    ['flat', JF.pack(text, { blockBytes: 65536, block: 'flat' })],
    ['nested', JF.pack(text, { blockBytes: 65536, block: 'nested' })],
    ['random access', JF.pack(text, { access: 'random' })],
    ['xxh64', JF.pack(text, { blockBytes: 65536, check: 'xxh64' })],
    ['exact', JF.pack(text, { exact: true, blockBytes: 65536 })],
    ['one block', JF.pack(text)],
    ['exact raw', JF.pack(Buffer.from(rows.slice(0, 6000).map((r) => '{ "id" : ' + r.id + ' ,  "name": "' + r.name + '" }').join('\r\n') + '\r\n'), { exact: true, blockBytes: 32768 })],
    ['tables', await JF.packTables({ a: rows.slice(0, 9000), b: rows.slice(9000, 20000) }, { blockBytes: 32768 })]
  ];
  for (const [name, bytes] of files) {
    let reads = 0, readBytes = 0; const fn = (o, len) => { reads++; readBytes += len; return bytes.subarray(o, o + len); }; fn.size = bytes.length;
    for (const [kind, src] of [['Blob', new Blob([bytes])], ['read()', fn], ['bytes', bytes]]) {
      const R = await JF.open(src), info = JF.info(bytes);
      ok(same(R.info, info), name + ' ' + kind + ': info matches');
      const tables = name === 'tables' ? [0, 1] : [0];
      for (const table of tables) {
        const all = JF.unpackRows(bytes, { table }), total = all.length;
        for (const [from, count] of [[0, 10], [0, undefined], [1234, 5000], [total - 3, 10], [total + 5, 4], [7000, 1]]) {
          const got = await R.rows({ from, count, table }), want = JF.unpackRows(bytes, { from, count, table });
          ok(same(got, want), name + ' ' + kind + ' table ' + table + ': rows from ' + from + ' count ' + count + ' (' + got.length + ' vs ' + want.length + ')');
        }
        const bl = R.blocks.map((b, i) => [b, i]).filter(([b]) => b.table === table), parts = [];
        for (const [, i] of bl) parts.push(...(await R.block(i)));
        ok(same(parts, all), name + ' ' + kind + ' table ' + table + ': blocks in order give every row');
      }
    }
    if (name !== 'exact raw' && name !== 'one block') {   /* a small window reads the trailer, the footer and one block only */
      const R = await JF.open(fn); reads = 0; readBytes = 0; await R.rows({ from: 1234, count: 5 });
      ok(reads === 1 && readBytes < bytes.length / 3, name + ': a 5-row window reads one block (' + reads + ' reads, ' + readBytes + ' of ' + bytes.length + ' bytes)');
      const d = Uint8Array.from(bytes), b = R.blocks[1]; d[b.offset + (b.length >> 1)] ^= 0x55;
      let err = ''; try { await (await JF.open(new Blob([d]))).block(1); } catch (e) { err = e.message; }
      ok(/checksum mismatch/.test(err), name + ': damage in a block is caught (' + err + ')');
    }
  }
  ok((await JF.open(files.find((f) => f[0] === 'exact raw')[1])).blocks.some((b) => b.kind === 'r'), 'the exact raw case has raw blocks');
  let e1 = ''; try { await JF.open(new Blob([Buffer.from('not a file at all, just text')])); } catch (e) { e1 = e.message; } ok(/not an LFC-pack/.test(e1), 'not a file: ' + e1);
  let e2 = ''; try { await JF.open((o, l) => new Uint8Array(l)); } catch (e) { e2 = e.message; } ok(/read.size/.test(e2), 'read() without size: ' + e2);
  // columns(i, { keys }) and zone(i, key) (0.5.9): the same columns as unpackColumns, one block at a time; the footer's number ranges
  { const fb = files.find((f) => f[0] === 'flat')[1], R = await JF.open(new Blob([fb])), j = (x) => JSON.stringify(x, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);
    const A = JF.unpackColumns(fb, { keys: ['id', 'v'] }), B = JF.unpackColumns(fb); let sameC = true, inZone = true;
    for (let i = 0; i < R.blocks.length; i++) {
      const c = await R.columns(i, { keys: ['id', 'v'] }), d = await R.columns(i);
      if (j(c) !== j(A[i]) || j(d) !== j(B[i])) sameC = false;
      const z = R.zone(i, 'id'), ids = Array.from(c.cols.id);
      if (!z || z.min !== Math.min(...ids) || z.max !== Math.max(...ids) || z.count !== ids.length) inZone = false;
    }
    ok(R.blocks.length > 3 && sameC, 'columns(i): the same entries as unpackColumns, with and without keys (' + R.blocks.length + ' blocks)');
    const first = await R.columns(0, { keys: ['id'] }), keep = j(first); await R.columns(1, { keys: ['id'] }); await R.block(2);
    ok(j(first) === keep, 'columns(i): the arrays stay the same after later reads');
    ok(inZone && R.zone(0, 'name') === null && R.zone(0, 'nope') === null, 'zone(i, key): min, max and count of a number column; null for text or a missing key');
    const Rn = await JF.open(files.find((f) => f[0] === 'nested')[1]); let e3 = ''; try { await Rn.columns(0); } catch (e) { e3 = e.message; }
    ok(/flat-row block/.test(e3), 'columns(i) on a nested block says to use block(i): ' + e3);
    let e4 = ''; try { await R.columns(999); } catch (e) { e4 = e.message; } ok(/out of range/.test(e4), 'columns(i) past the end: ' + e4); }
  console.log((bad ? 'FAIL' : 'ok  ') + ' open(): ' + n + ' checks, bad ' + bad);
  process.exitCode = bad ? 1 : 0; if (JF.close) JF.close();
})();
