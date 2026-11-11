// Copyright (c) 2026 LFC Foundry. MIT License.
// Seeded made-up datasets for the compression research (no real data).
const G = require('../../../../modules/lfc-pack/test/gen.cjs');
let seed = 11; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const hex = (n) => { let s = ''; for (let i = 0; i < n; i++) s += '0123456789abcdef'[(r() * 16) | 0]; return s; };
const uuid = () => hex(8) + '-' + hex(4) + '-4' + hex(3) + '-a' + hex(3) + '-' + hex(12);
const sets = {
  logs: (n) => G.logs(n),
  events: (n) => G.events(n),
  sensors: (n) => { seed = 11; const o = []; let t = 20; for (let i = 0; i < n; i++) { t += (r() - 0.5) * 0.2; o.push(JSON.stringify({ ts: 1760000000000 + i * 1000, dev: 'dev-' + ((r() * 50) | 0), temp: Math.round(t * 100) / 100, hum: 30 + ((r() * 40) | 0), lat: Math.round((42.33 + r() * 0.01) * 1e6) / 1e6, lon: Math.round((-83.04 + r() * 0.01) * 1e6) / 1e6, ok: r() > 0.02 })); } return o.join('\n') + '\n'; },
  ids: (n) => { seed = 11; const o = []; for (let i = 0; i < n; i++) o.push(JSON.stringify({ id: uuid(), sha: hex(40), x: r(), k: (r() * 2147483647) | 0, tag: Math.floor(r() * 1e15).toString(36) })); return o.join('\n') + '\n'; },
  repeat: (n) => { seed = 11; const o = []; for (let i = 0; i < n; i++) o.push(JSON.stringify({ app: 'mind-mapper', theme: 'light', zoom: 1 + (i % 4) * 0.25, panel: ['outline', 'canvas'][i % 2], node: 'Node ' + (i % 20), on: true })); return o.join('\n') + '\n'; },
};
module.exports = (name, n) => Buffer.from(sets[name](n));
module.exports.names = Object.keys(sets);
