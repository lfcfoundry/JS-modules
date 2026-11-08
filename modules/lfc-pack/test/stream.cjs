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
  { // since 0.6.2 the waiting text is kept as pushed pieces: a caller that reuses one buffer for every push must still get the same file, for tiny and big pushes
    const lines = []; for (let i = 0; i < 30000; i++) lines.push(JSON.stringify({ id: i, name: 'n' + (i % 700), v: (i * 13) % 1000 / 10 }));
    const text = Buffer.from(lines.join('\n') + '\n');
    const once = (chunk, reuse) => { const s = JF.packStream({ blockBytes: 65536, share: true }), out = [], scratch = new Uint8Array(chunk);
      for (let o = 0; o < text.length; o += chunk) { const piece = text.subarray(o, o + chunk); let b = piece; if (reuse) { scratch.set(piece); b = scratch.subarray(0, piece.length); } out.push(...s.push(b)); if (reuse) scratch.fill(0); }
      out.push(...s.finish()); return Buffer.concat(out.map((x) => Buffer.from(x))); };
    const want = once(1 << 22, false);
    for (const chunk of [7, 4096, 65536, 200000]) assert.ok(once(chunk, true).equals(want), 'reused buffer, pushes of ' + chunk + ' bytes: same file');
    console.log('reused push buffer: same file for 4 push sizes, ok');
  }
})().catch((e) => { console.error(e); process.exit(1); });
