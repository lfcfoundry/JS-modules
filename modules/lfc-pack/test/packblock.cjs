// Copyright (c) 2026 LFC Foundry. MIT License.
// packBlock + packStream().pushPacked (since 0.7.0): chunks packed on their own, here in worker threads too, and appended in order give the same bytes as push.
const JF = require('../lfc-pack.js'), assert = require('assert'), gen = require('./gen.cjs');
(async () => {
  await JF.init();
  { // since 0.7.0 packBlock + pushPacked: chunks packed on their own (here in worker threads too) and appended in order give the same file as push
    const { Worker } = require('worker_threads'), path = require('path');
    const chunks = (b, bb) => { const out = []; let p = 0;
      while (p < b.length) { let e = b.length; if (b.length - p > bb) { const nl = b.indexOf(10, p + bb); if (nl >= 0) e = nl + 1; } out.push(b.subarray(p, e)); p = e; }
      return out; };
    const cases2 = [['logs', gen.logs(30000), 300000, {}], ['events', gen.events(8000), 200000, { meta: { a: 1 } }], ['no final newline', gen.logs(2000).replace(/\n$/, ''), 40000, {}],
      ['one block', gen.logs(100), 21 << 20, {}], ['empty', '', 1000, {}], ['random access, no share', gen.events(6000), 0, { access: 'random', share: false }]];
    for (const [name, text, bb0, extra] of cases2) {
      const b = Buffer.from(text), o = Object.assign({}, extra, bb0 ? { blockBytes: bb0 } : {}), bb = o.blockBytes || 262144;
      const want = (() => { const s = JF.packStream(o), parts = [...s.push(b), ...s.finish()]; return Buffer.concat(parts.map(x => Buffer.from(x))); })();
      const s = JF.packStream(o), parts = [];
      for (const c of chunks(b, bb)) parts.push(...s.pushPacked(JF.packBlock(c, o)));
      parts.push(...s.finish());
      assert.ok(Buffer.concat(parts.map(x => Buffer.from(x))).equals(want), name + ': packBlock + pushPacked bytes differ');
      console.log(name, 'packBlock + pushPacked: same bytes, ok');
    }
    { // two worker threads pack alternate chunks; the main thread appends them in order
      const b = Buffer.from(gen.logs(30000)), o = { blockBytes: 120000 }, cs = chunks(b, o.blockBytes);
      const src = "const JF = require(" + JSON.stringify(path.join(__dirname, '..', 'lfc-pack.js')) + "), { parentPort } = require('worker_threads'); const ready = JF.init();" +
        "parentPort.on('message', async (m) => { await ready; const r = JF.packBlock(m.c, m.o); parentPort.postMessage({ i: m.i, r }, [r.buffer]); });";
      const ws = [0, 1].map(() => new Worker(src, { eval: true })), got = new Array(cs.length);
      const wait = new Array(cs.length); ws.forEach((w) => w.on('message', (m) => { got[m.i] = m.r; wait[m.i](); }));
      await Promise.all(cs.map((c, i) => new Promise((res) => { wait[i] = res; ws[i % 2].postMessage({ i, c: new Uint8Array(c), o }); })));
      ws.forEach((w) => w.terminate());
      const s = JF.packStream(o), parts = []; for (const r of got) parts.push(...s.pushPacked(r)); parts.push(...s.finish());
      assert.ok(Buffer.concat(parts.map(x => Buffer.from(x))).equals(Buffer.from(JF.pack(b, o))), 'worker packBlock: bytes differ');
      console.log('2 worker threads,', cs.length, 'chunks: same bytes as pack, ok');
    }
    assert.throws(() => JF.packBlock(Buffer.from('{"a":1}\n'), { share: true }), /share/);
    assert.throws(() => JF.packBlock(Buffer.from('{"a":1}\n'), { exact: true }), /exact/);
    assert.throws(() => JF.packStream({ share: true }).pushPacked(JF.packBlock(Buffer.from('{"a":1}\n'))), /share/);
    { const s = JF.packStream({ blockBytes: 1000 }); s.push(Buffer.from('half a line')); assert.throws(() => s.pushPacked(JF.packBlock(Buffer.from('{"a":1}\n'))), /cannot follow/); }
    assert.throws(() => JF.packStream().pushPacked(JF.pack(Buffer.from('{"a":1}\n'), { exact: true })), /packBlock/);
    console.log('packBlock / pushPacked refusals, ok');
  }
})().catch((e) => { console.error(e); process.exit(1); });
