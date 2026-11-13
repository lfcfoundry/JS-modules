const L = require(process.argv[2]), fs = require('fs'); (async () => { await L.init(); const rows = fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').map(l => JSON.parse(l));
 for (let i = 0; i < 6; i++) { globalThis.__BT = []; const t = performance.now(); L.packRows(rows); console.log((performance.now() - t).toFixed(1), JSON.stringify(globalThis.__BT)); } })();
