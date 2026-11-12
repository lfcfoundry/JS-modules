// Copyright (c) 2026 LFC Foundry. MIT License.
// null-plane prototype: rows come back as JSON.parse gives them, sizes against the base build and the left-out stand-in
const [A, B] = [require(process.argv[2]), require(process.argv[3])], fs = require('fs');
(async () => { await A.init(); await B.init(); let bad = 0;
  for (const f of process.argv.slice(4)) { const t = fs.readFileSync(f), want = JSON.stringify(t.toString().split('\n').filter(l => l.trim()).map(l => JSON.parse(l)));
    const pa = A.pack(t), pb = B.pack(t), got = JSON.stringify(B.unpack(pb)), cols = B.unpackColumns ? (() => { try { B.unpackColumns(pb); return 'cols ok'; } catch (e) { return 'cols: ' + e.message.slice(0, 40); } })() : '';
    const canon = x => JSON.stringify(x, (k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(q => [q, v[q]])) : v); const ok = got === want || canon(B.unpack(pb)) === canon(JSON.parse(want)); if (!ok) bad++;
    const nt = B.stats(pb).flatMap(b => (b.keys || []).filter(k => k.type === 'N').map(k => k.key)).join(',');
    console.log(f.split('/').pop().padEnd(26), String(pa.length).padStart(9), '->', String(pb.length).padStart(9), (100 * (pb.length / pa.length - 1)).toFixed(1).padStart(6) + '%', ok ? 'same rows' : 'DIFF', cols, 'N:', nt || '-'); }
  console.log(bad, 'files differ'); })();
