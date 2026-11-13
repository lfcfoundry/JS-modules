const fs = require('fs'), A = require(process.argv[2]), B = require(process.argv[3]);
(async () => { await A.init(); await B.init(); let bad = 0;
 for (const f of process.argv.slice(4)) { const rows = fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const x = A.packRows(rows), t = performance.now(), y = await B.packRowsParallel(rows, { workers: 3 }), d = performance.now() - t; const same = Buffer.compare(Buffer.from(x), Buffer.from(y)) === 0; if (!same) { bad++; console.log('DIFF', f, x.length, y.length); } else console.log('same', f.split('/').pop(), d.toFixed(0) + ' ms'); }
 console.log('done, diffs', bad); process.exit(0); })();
