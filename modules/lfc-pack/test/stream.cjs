// Copyright (c) 2026 LFC Foundry. MIT License.
// packStream gives, joined, the same bytes as pack for the same text and block size, however the text is cut into pushes.
const JF = require('../lfc-pack.js'), assert = require('assert'), gen = require('./gen.cjs');
(async () => {
  await JF.init();
  const cases = [['logs', gen.logs(30000), 300000], ['events', gen.events(8000), 200000], ['no final newline', gen.logs(2000).replace(/\n$/, ''), 40000], ['one block', gen.logs(100), 21 << 20], ['empty', '', 1000]];
  for (const [name, text, bb] of cases) {
    const b = Buffer.from(text), want = Buffer.from(JF.pack(b, { blockBytes: bb }));
    for (const step of [7919, 100000, b.length + 1]) {
      const s = JF.packStream({ blockBytes: bb }), parts = []; let early = 0;
      for (let p = 0; p < b.length; p += step) { const o = s.push(b.subarray(p, p + step)); early += o.length; parts.push(...o); }
      parts.push(...s.finish());
      assert.ok(Buffer.concat(parts.map(x => Buffer.from(x))).equals(want), name + ' step ' + step + ': bytes differ');
      if (b.length > 3 * bb && step < bb) assert.ok(early > 0, name + ': nothing came out before finish');
    }
    console.log(name, 'blocks', JF.info(want).blocks, 'same bytes for 3 push sizes, ok');
  }
  assert.throws(() => JF.packStream({ exact: true }), /exact/);
})().catch((e) => { console.error(e); process.exit(1); });
