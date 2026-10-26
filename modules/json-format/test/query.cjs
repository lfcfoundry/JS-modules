// Copyright (c) 2026 LFC Foundry. MIT License.
// Projection and zone-map range reads give the same rows as filtering JSON.parse output.
const JF = require('../json-format.js'), fs = require('fs'), assert = require('assert'), gen = require('./gen.cjs');
(async () => {
  await JF.init();
  for (const [f, rangeKey, text] of [['made-up logs', 'ts', gen.logs(20000)], ['made-up events', 'id', gen.events(6000)]]) {
    const b = Buffer.from(text), want = b.toString().split('\n').filter(Boolean).map(JSON.parse), p = JF.pack(b, { blockBytes: 300000 }), keys = Object.keys(want[0]).slice(0, 2);
    assert.deepStrictEqual(JF.unpack(p), want);
    const pick = (r, ks) => { const o = {}; for (const x of ks) if (x in r) o[x] = r[x]; return o; };
    assert.deepStrictEqual(JF.unpack(p, { keys }), want.map((r) => pick(r, keys)));
    const vs = want.map((r) => r[rangeKey]).filter((x) => typeof x === 'number').sort((a, b) => a - b), lo = vs[Math.floor(vs.length * 0.4)], hi = vs[Math.floor(vs.length * 0.42)];
    const inR = (r) => typeof r[rangeKey] === 'number' && r[rangeKey] >= lo && r[rangeKey] <= hi;
    assert.deepStrictEqual(JF.unpack(p, { range: { key: rangeKey, min: lo, max: hi } }), want.filter(inR));
    assert.deepStrictEqual(JF.unpack(p, { keys, range: { key: rangeKey, min: lo, max: hi } }), want.filter(inR).map((r) => pick(r, keys)));
    console.log(f, 'blocks', JF.info(p).blocks, 'rows in range', want.filter(inR).length, 'ok');
  }
})();
