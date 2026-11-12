// Copyright (c) 2026 LFC Foundry. MIT License.
// research B19: every mode of unpack(file, { equals }) gives exactly unpack(file).filter(r => r[key] === value) (same values, same key order as the full read), at 13 MB, 4 MB and 256 KB blocks, with and without keys; the full read itself is checked against the input rows with keys sorted
const fs = require('fs'); (async () => { const L = require(process.argv[2]); await L.init(); let bad = 0, n = 0;
  const Q = JSON.parse(process.argv[4]);
  for (const f of process.argv[3].split(',')) { const rows = fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    for (const bb of [undefined, 4194304, 262144]) { const b = L.pack(fs.readFileSync(f), bb ? { blockBytes: bb } : undefined); const st = L.stats(b), full = L.unpack(b); const cz = rs => JSON.stringify(rs.map(r => { const o = {}; for (const k of Object.keys(r).sort()) o[k] = r[k]; return o; })); if (cz(full) !== cz(rows)) { bad++; console.log('FULL READ DIFFERS', f, bb); }
      const types = {}; st.forEach(x => (x.keys || []).forEach(k => { types[k.key] = (types[k.key] || new Set()).add(k.type + (k.type === 'N' ? '' : '')); }));
      for (const [k, v] of Q[f] || []) for (const keys of [undefined, ['id']]) { const want = JSON.stringify(full.filter(r => r[k] === v).map(r => keys ? { id: r.id } : r));
        for (const m of (process.env.MODES || 'off,plain,codes').split(',')) { globalThis.__B19 = m; const got = JSON.stringify(L.unpack(b, { equals: { key: k, value: v }, keys })); n++; if (got !== want) { bad++; console.log('DIFFER', f, bb, k, v, keys, m, got.length, want.length); } } }
      if (bb === undefined) console.log(f, st.length, 'blocks', Object.entries(types).map(([k, s]) => k + ':' + [...s].join('/')).join(' ')); } }
  console.log(n, 'checks', bad, 'differ'); })();
