// Copyright (c) 2026 LFC Foundry. MIT License.
// B30: packParallel(Blob) gives the same bytes as pack(bytes) and packParallel(bytes): small file, no trailing newline, lines longer than a 64 KB window, blank runs, three block sizes, head block, exact/share fallback, a Blob whose read fails. Pass/fail only. Run: node modules/lfc-pack/test/b30.cjs
'use strict';
const J = require('../lfc-pack.js'), g = require('./gen.cjs');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const eq = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  const long = '{"a":"' + 'x'.repeat(200000) + '"}\n';
  const C = { small: g.logs(50), logs: g.logs(60000), noTrail: g.logs(60000).trimEnd(), longLines: (g.logs(20000) + long).repeat(3), blankRuns: g.logs(30000).replace(/\n/g, (m, i) => (i % 5000 ? '\n' : '\n\n\n\n')), events: g.events(40000) };
  for (const [nm, t] of Object.entries(C)) for (const bb of [undefined, 262144, 1 << 20]) {
    const u = Buffer.from(t), o = bb ? { blockBytes: bb, workers: 3 } : { workers: 3 }, ref = J.pack(u, bb ? { blockBytes: bb } : {});
    ok(eq(await J.packParallel(new Blob([u]), o), ref), nm + ' ' + bb + ' Blob = pack');
    ok(eq(await J.packParallel(u, o), ref), nm + ' ' + bb + ' bytes = pack');
  }
  const u = Buffer.from(C.logs);
  for (const o of [{ exact: true }, { share: true }, { balance: true }]) ok(eq(await J.packParallel(new Blob([u]), Object.assign({ workers: 3 }, o)), await J.packParallel(u, Object.assign({ workers: 3 }, o))), 'Blob falls back with ' + Object.keys(o)[0]);
  const bad1 = { size: u.length, slice() { return { arrayBuffer: () => Promise.reject(new Error('blob read failed')) }; } };
  Object.setPrototypeOf(bad1, Blob.prototype);
  let err = null; try { await J.packParallel(bad1, { workers: 3 }); } catch (e) { err = e; } ok(err !== null, 'a Blob whose read fails rejects');
  J.trim && J.trim();
  console.log(bad ? 'b30: ' + bad + ' bad of ' + n : 'b30 ok, ' + n + ' checks'); process.exit(bad ? 1 : 0);
})();
