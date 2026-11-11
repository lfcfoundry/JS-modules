// Copyright (c) 2026 LFC Foundry. MIT License.
// Node pass/fail + sizes (sizes are deterministic, no times)
globalThis.__H = { c() {}, d() {} };
const fs = require('fs'), assert = require('assert');
const vs = ['base', 'uuid', 'sample', 'both'].map(v => [v, require('./www/v-' + v + '.js')]);
(async () => {
  for (const [, J] of vs) await J.init();
  for (const f of fs.readdirSync('www').filter(f => f.endsWith('.ndjson')).sort()) {
    const b = fs.readFileSync('www/' + f), want = b.toString().split('\n').filter(Boolean).map(l => JSON.parse(l)); const line = [f];
    let base = null;
    for (const [v, J] of vs) { const p = Buffer.from(J.pack(b)); const rows = vs[0][1].unpack(p); assert.deepStrictEqual(rows, want); if (!base) base = p; line.push(v + ' ' + p.length + (v === 'uuid' ? (p.equals(base) ? ' same-bytes' : ' DIFF') : ' x' + (p.length / base.length).toFixed(4))); }
    console.log(line.join(' | '));
  }
})();
