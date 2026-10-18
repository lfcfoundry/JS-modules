// Number columns for the Pcodec study: real Net Flow Map layouts and values, plus the jso test sets.
'use strict';
const NFM = '/home/claude/net-flow-map/', T = '/mnt/project-files/js-modules-research/memory-compression-jso/1.1.0/proposed-tree/';
global.NFMColumns = require(NFM + 'src/columns.js');
const E = require(NFM + 'src/engine.js'), GEN = require(NFM + 'bench/gen.js'), D = require(T + 'test/data.js');
function layout(n, kind, arrange) {
  const g = GEN.graph(kind, n, 11), dg = NFMColumns.derive(JSON.parse(JSON.stringify(g)));
  return E.build(dg, { view: 'network', arrange: arrange || 'stress', colorBy: 'group' });
}
module.exports = function () {
  const cols = [];
  const add = (name, arr, note) => cols.push({ name, arr: Array.from(arr), note });
  for (const [n, kind] of [[10000, 'moderate']]) {
    const L = layout(n, kind);
    add(`NFM node x, Distances layout, ${n}`, L.nodes.map((q) => q.cx), 'real layout');
    add(`NFM node y, Distances layout, ${n}`, L.nodes.map((q) => q.cy), 'real layout');
    add(`NFM node radius, ${n}`, L.nodes.map((q) => q.r), 'real');
    const F = layout(n, kind, 'force');
    add(`NFM node x, Force layout, ${n}`, F.nodes.map((q) => q.cx), 'real layout');
    // rounded the way a saved view could keep them (2 decimals)
    add(`NFM node x rounded to 0.01, ${n}`, L.nodes.map((q) => Math.round(q.cx * 100) / 100), 'derived');
    const e = L.edges || [];
    if (e.length) { add(`NFM link width`, e.map((q) => q.w !== undefined ? q.w : q.width || 0), 'real'); }
  }
  const S = D.sets;
  const links = S['nfm-links'](100000), nodes = S['nfm-nodes'](50000), users = S['api-users'](50000), geo = S['geojson'](10000), ev = S['events'](100000);
  add('links.id (0..n)', links.map((q) => q.id), 'synthetic');
  add('links.from (clustered ids)', links.map((q) => q.from), 'synthetic');
  add('links.to (80% near from)', links.map((q) => q.to), 'synthetic');
  add('links.weight (multiples of 0.25)', links.map((q) => q.weight), 'synthetic');
  add('links.x1 (gaussian noise)', links.map((q) => q.x1), 'synthetic noise');
  add('links.color (6 palette values)', links.map((q) => q.color), 'synthetic');
  add('nodes.x (cos + noise)', nodes.map((q) => q.x), 'synthetic');
  add('nodes.size (1..2.5 steps)', nodes.map((q) => q.size), 'synthetic');
  add('events.ts (increasing ms)', ev.map((q) => q.ts), 'synthetic');
  add('events.ms (0..899)', ev.map((q) => q.ms), 'synthetic');
  add('events.user (0..4999)', ev.map((q) => q.user), 'synthetic');
  const gx = []; geo.forEach((f) => f.geometry.coordinates.forEach((c) => gx.push(c[0])));
  add('geojson longitude (6 decimals, random walk)', gx, 'synthetic');
  // shapes pcodec's own papers target (synthetic here, so they show best cases and are labeled that way)
  const r = D.rng(21), gauss = () => { let a = 0; for (let i = 0; i < 12; i++) a += r(); return a - 6; };
  const N2 = 100000, temp = [], price = [], ts = [], tsms = [], lat = [], lon = [], kwh = [];
  let pr = 100, la = 40.7, lo = -74, t0 = 1760000000;
  for (let i = 0; i < N2; i++) {
    temp.push(Math.round((20 + 5 * Math.sin(i / 2000) + gauss() * 0.3) * 10) / 10);
    pr = Math.max(1, pr + gauss() * 0.4); price.push(Math.round(pr * 100) / 100);
    t0 += 1 + Math.floor(r() * 3); ts.push(t0); tsms.push(t0 * 1000);
    la += gauss() * 0.0002; lo += gauss() * 0.0002; lat.push(Math.round(la * 1e5) / 1e5); lon.push(Math.round(lo * 1e5) / 1e5);
    kwh.push(Math.round((0.4 + 0.3 * Math.abs(Math.sin(i / 700)) + gauss() * 0.02) * 1000) / 1000);
  }
  add('temperature, 1 decimal, smooth (synthetic)', temp, 'synthetic');
  add('price, 2 decimals, random walk (synthetic)', price, 'synthetic');
  add('timestamp seconds, jittered steps (synthetic)', ts, 'synthetic');
  add('timestamp milliseconds, all :000 (synthetic)', tsms, 'synthetic');
  add('GPS latitude, 5 decimals (synthetic)', lat, 'synthetic');
  add('GPS longitude, 5 decimals (synthetic)', lon, 'synthetic');
  add('meter reading kWh, 3 decimals (synthetic)', kwh, 'synthetic');
  return cols;
};
