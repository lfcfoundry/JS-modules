const L = require(process.argv[2]);
(async () => { await L.init();
 const t = Array.from({length: 100}, (_, i) => JSON.stringify({ s: 'v' + (i % 3), n: i * 1.5, t: i % 2 === 0 })).join('\n') + '\n';
 const rows = L.unpack(L.pack(t)); const want = t.trim().split('\n').map(l => JSON.parse(l));
 for (let i = 0; i < 100; i++) if (rows[i].n !== want[i].n) { console.log('bad', i, rows[i].n, want[i].n); break; }
 const b = L.packRows(want), r2 = L.unpack(b); for (let i = 0; i < 100; i++) if (r2[i].n !== want[i].n) { console.log('bad2', i, r2[i].n, want[i].n); break; }
 console.log('done'); })();
