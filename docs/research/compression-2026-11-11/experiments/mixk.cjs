// Copyright (c) 2026 LFC Foundry. MIT License.
// k of 12 extra columns are nullable (null in the first row, 2% after), the rest plain numbers or strings: share of fallback cells about k/13
const fs = require('fs'); let seed = 4; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
for (const k of [1, 3, 6, 9]) { seed = 4; const o = []; for (let i = 0; i < 300000; i++) { const x = { id: i };
  for (let c = 0; c < 12; c++) { const mixed = c < k; x['c' + c] = mixed && (i === 0 || r() < 0.02) ? null : c % 3 === 2 ? 'item ' + ((r() * 500) | 0) : Math.round(r() * 1e6) / 100; }
  o.push(JSON.stringify(x)); } fs.writeFileSync(`www/mix${k}-300000.ndjson`, o.join('\n') + '\n'); }
