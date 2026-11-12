// Copyright (c) 2026 LFC Foundry. MIT License.
// size, pack and unpack time (Node, median of 5) for null vs absent pairs; and the column type chosen
const L = require(process.argv[2]), fs = require('fs');
L.init().then(() => {
  const med = f => { const r = []; for (let k = 0; k < 5; k++) { const t = performance.now(); f(); r.push(performance.now() - t); } r.sort((a, b) => a - b); return r[2]; };
  for (const f of process.argv.slice(3)) { const b = fs.readFileSync(f); const p = L.pack(b);
    const tp = med(() => L.pack(b)), tu = med(() => L.unpack(p)); let ty = '';
    try { const R = L.unpackColumns(p); } catch (e) {}
    console.log(f.padEnd(26), String(p.length).padStart(9), 'pack', tp.toFixed(0).padStart(4), 'unpack', tu.toFixed(0).padStart(4)); }
});
