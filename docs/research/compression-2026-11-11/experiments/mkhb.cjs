const L = require(process.argv[2]), fs = require('fs');
(async () => { await L.init(); const t = fs.readFileSync(process.argv[3]);
 for (const [name, o] of [['13m', {}], ['13m-h64k', { _head: 65536 }], ['4m', { blockBytes: 4194304 }], ['4m-h64k', { blockBytes: 4194304, _head: 65536 }]]) {
  const s = L.packStream(o); const out = []; for (let i = 0; i < t.length; i += 1 << 20) out.push(...s.push(t.subarray(i, i + (1 << 20)))); out.push(...[].concat(s.finish()));
  const b = Buffer.concat(out.map(x => Buffer.from(x))); fs.writeFileSync(process.argv[4] + '/' + process.argv[5] + '-' + name + '.lfc', b);
  const f = L.open ? null : null; console.log(name, b.length, L.stats(b).length, 'blocks; same rows', JSON.stringify(L.unpack(b)).length === JSON.stringify(L.unpack(L.pack(t))).length); } })();
