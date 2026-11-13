const fs = require('fs'), V = process.argv[2].split(','), f = process.argv[3], rows = JSON.parse('[' + fs.readFileSync(f, 'utf8').trim().split('\n').join(',') + ']');
const L = V.map(v => require(v)); (async () => { for (const l of L) await l.init(); const t = V.map(() => []);
 for (let r = 0; r < 7; r++) for (let q = 0; q < L.length; q++) { const a = performance.now(); L[q].packRows(rows); t[q].push(performance.now() - a); }
 const med = a => a.slice(2).sort((x, y) => x - y)[2]; console.log(f.split('/').pop(), V.map((v, q) => v.split('/').pop() + ' ' + med(t[q]).toFixed(0)).join('  '), 'ratio', (med(t[1]) / med(t[0])).toFixed(3)); })();
