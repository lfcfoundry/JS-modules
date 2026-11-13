const fs = require('fs'), A = require(process.argv[2]), B = require(process.argv[3]);
(async () => { await A.init(); await B.init(); let bad = 0;
 for (const f of process.argv.slice(4)) { const rows = fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l)); const x = Buffer.from(A.packRows(rows));
  for (let k = 0; k < 3; k++) { const t = performance.now(), y = await B.packRowsParallel(rows, { workers: 3 }); const same = Buffer.compare(x, Buffer.from(y)) === 0; if (!same) bad++; console.log(same ? 'same' : 'DIFF', f.split('/').pop(), k, (performance.now() - t).toFixed(0) + ' ms'); } }
 console.log('done, diffs', bad); process.exit(0); })();
