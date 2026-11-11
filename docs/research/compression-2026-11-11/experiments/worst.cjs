// Copyright (c) 2026 LFC Foundry. MIT License.
// Worst cases for B3b: every cell of every mixed column takes the fallback (first row null), ASCII and non-ASCII
const fs = require('fs'); let seed = 3; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function rows(n, uni) { seed = 3; const o = []; for (let i = 0; i < n; i++) { const x = { id: i };
  for (let c = 0; c < 6; c++) x['n' + c] = i === 0 || r() < 0.02 ? null : Math.round(r() * 1e6) / 100;      // nullable decimals
  for (let c = 0; c < 3; c++) x['s' + c] = i === 0 || r() < 0.02 ? null : (uni ? 'café ' : 'item ') + ((r() * 500) | 0);  // nullable strings
  for (let c = 0; c < 3; c++) x['m' + c] = r() < 0.5 ? (r() * 1000) | 0 : 'x' + ((r() * 40) | 0);        // number/string mix
  o.push(JSON.stringify(x)); } return o.join('\n') + '\n'; }
for (const n of [30000, 300000]) { fs.writeFileSync(`www/allmix-${n}.ndjson`, rows(n, false)); fs.writeFileSync(`www/allmixu-${n}.ndjson`, rows(n, true)); }
