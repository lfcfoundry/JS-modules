const fs = require('fs'), A = require(process.argv[2]), B = require(process.argv[3]);
(async () => { await A.init(); await B.init(); let bad = 0;
 for (const f of process.argv.slice(4)) { const t = fs.readFileSync(f), rows = t.toString().split('\n').filter(Boolean).map(l => JSON.parse(l));
  for (const [nm, fn] of [['packRows', L => L.packRows(rows)], ['pack', L => L.pack(t)], ['exact', L => L.packRows(rows, { exact: true })]]) { const x = await fn(A), y = await fn(B); const same = Buffer.compare(Buffer.from(x), Buffer.from(y)) === 0; if (!same) bad++; if (!same) console.log('DIFF', f, nm, x.length, y.length); } }
 console.log('done, diffs', bad); })();
