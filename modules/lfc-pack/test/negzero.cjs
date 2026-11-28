// Copyright (c) 2026 LFC Foundry. MIT License. packBlock number columns holding -0 (since 0.26.13): stored as 0, as the text path always stored them, so the file is the same bytes as the column with 0, and the caller's arrays keep their -0.
const J = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await J.init();
  let s = 7; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const N = 6000, eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]); let n = 0;
  for (const kind of ['array', 'f64', 'f32', 'many', 'one'])
    for (const opts of [{}, { level: 3, blockBytes: 2097152, share: false }, { summary: false }]) {
      const mk = () => kind === 'f64' ? new Float64Array(N) : kind === 'f32' ? new Float32Array(N) : new Array(N);
      const v = mk(), z = mk();
      for (let i = 0; i < N; i++) { let x = Math.round(r() * 2000 - 1000) / 10; if (kind === 'many' ? r() < 0.5 : kind === 'one' ? i === 77 : r() < 0.01) x = -0; v[i] = x; z[i] = x === 0 ? 0 : x; }
      const t = Array.from({ length: N }, (_, i) => 't' + (i % 50)), c = Array.from({ length: N }, (_, i) => i);
      const a = await J.packBlock({ a: v, b: t, c }, opts), b = await J.packBlock({ a: z, b: t, c }, opts);
      assert.ok(eq(a, b), kind + ': -0 column packs to the same bytes as the 0 column');
      assert.ok(Array.prototype.some.call(v, (x) => x === 0 && 1 / x < 0), kind + ': the caller array still holds -0');
      const back = J.unpack(a); assert.strictEqual(back.length, N); for (let i = 0; i < N; i += 97) assert.ok(back[i].a === z[i], kind + ' row ' + i);
      n++;
    }
  console.log('-0 columns: ' + n + ' cases, same bytes as 0, caller arrays kept');
})().catch((e) => { console.error(e); process.exit(1); });
