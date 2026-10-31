// Copyright (c) 2026 LFC Foundry. MIT License.
// Spare array: repeat toArray and slice give the same values with the spare on and off, a result handed out is never handed out again, setSpare(false) turns it off.
const EF = require('../elias-fano.js'), assert = require('assert');
(async () => {
  if (EF.ready) await EF.ready();
  let x = 0; const v = new Uint32Array(400000); for (let i = 0; i < v.length; i++) { x += 1 + (Math.imul(i, 2654435761) >>> 27); v[i] = x; }
  const e = EF.open(EF.build(v)), want = e.toArray().slice(), got = [];
  for (let k = 0; k < 4; k++) { await new Promise((r) => setTimeout(r, 30)); const a = e.toArray(); assert.deepStrictEqual(a, want, 'toArray ' + k); got.forEach((g) => assert.notStrictEqual(g, a, 'same array handed out twice')); got.push(a); }
  for (let k = 0; k < 3; k++) { await new Promise((r) => setTimeout(r, 30)); assert.deepStrictEqual(e.slice(10, 300010), want.subarray(10, 300010), 'slice ' + k); }
  got.forEach((g) => assert.deepStrictEqual(g, want, 'earlier results unchanged'));
  EF.setSpare(false); assert.deepStrictEqual(e.toArray(), want, 'spare off'); EF.setSpare(true);
  console.log('ok   elias-fano spare: same values, never shared, can be turned off'); process.exit(0);
})().catch((e) => { console.log('FAIL', e && e.message || e); process.exit(1); });
