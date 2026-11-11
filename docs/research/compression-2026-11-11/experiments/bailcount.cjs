// Copyright (c) 2026 LFC Foundry. MIT License.
// Which fast-writer give-up codes real files hit, per build (counts only).
const fs = require('fs'), J = '/mnt/project-files/json-format/';
const files = { fhir: J + 'test-data/fhir-21mb.ndjson', gen_logs: J + 'optional-keys/gen-sets/nd_gen_logs.ndjson', gen_config: J + 'optional-keys/gen-sets/nd_gen_config.ndjson', gen_sparse: J + 'optional-keys/gen-sets/nd_gen_sparse.ndjson', nd_dense: J + 'columns-v2/row-objects/nd_dense_1x.ndjson', events10x: J + 'scale/events-10x.ndjson' };
(async () => {
  for (const lib of process.argv.slice(2)) { const L = require('./' + lib); await L.init();
    for (const [k, f] of Object.entries(files)) { let b = fs.readFileSync(f); if (b.length > 13e6) b = b.subarray(0, b.indexOf(10, 13e6) + 1);
      globalThis.__BAIL = {}; const p = L.pack(b, { blockBytes: 1 << 20 }); const st = L.stats(p); const kinds = {}; for (const x of st) kinds[x.kind] = (kinds[x.kind] || 0) + 1;
      console.log(lib, k, (b.length / 1e6).toFixed(1) + ' MB', 'blocks', JSON.stringify(kinds), 'declined', JSON.stringify(globalThis.__BAIL)); } }
})();
