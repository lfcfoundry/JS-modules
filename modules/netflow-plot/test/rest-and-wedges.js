/* Copyright (c) 2026 LFC Foundry. MIT License. Run from run.js, or alone: node modules/netflow-plot/test/rest-and-wedges.js.
   2.17.0 checks (Node, pass/fail only):
   1. The folded rest of a long list is its own identity, never the string "Other": real Other / Others / Others, average / blank / missing
      categories keep their own marks and literal labels, no two marks read the same, and every row and every value is kept (conservation),
      in any input order, through make(), JSON and SVG.
   2. Donut wedges: every positive share is a polygon with positive area AFTER the SVG's two-decimal rounding (read back from the SVG text),
      at least MIN_ARC px wide at the rim, in order, without overlap, and the ring closes. Pixel visibility in a browser is NOT checked here. */
'use strict';
module.exports = function (P, S, ok) {
  const W = { width: 600, height: 400 };
  const make = (rows, spec, o) => P.make(rows, spec, o || W, S);
  const label = (m) => String(m.t).replace(/: [^:]*$/, '');
  const value = (m) => Number((/: (-?[\d.,]+(?:e[+-]?\d+)?)[^:]*$/i.exec(m.t) || [])[1].replace(/,/g, ''));
  const rowsOf = (s) => s.marks.flatMap((m) => m.rows || []);
  function conserved(name, rows, spec, expect) {
    rows = rows.map((r) => ('v' in r && spec.y === 'amount' ? Object.assign({ amount: r.v }, r) : r));
    const s = make(rows, spec), cov = rowsOf(s), labels = s.marks.map(label);
    ok(cov.length === rows.length && new Set(cov).size === rows.length, name + ': every row in exactly one mark (' + new Set(cov).size + ' of ' + rows.length + ')');
    ok(new Set(labels).size === labels.length, name + ': no two marks read the same: ' + labels.join(' | '));
    ok(!labels.some((t) => /\[object/.test(t)), name + ': labels are text');
    if (expect && expect.sum !== undefined) {
      const got = s.marks.reduce((a, m) => a + value(m), 0);
      ok(Math.abs(got - expect.sum) < 1e-9 * Math.max(1, Math.abs(expect.sum)), name + ': values add up to ' + expect.sum + ' (got ' + got + ')');
    }
    if (expect && expect.marks) for (const [t, n] of expect.marks) ok(s.marks.some((m) => label(m) === t && m.rows.length === n), name + ': has "' + t + '" with ' + n + ' row(s)');
    return s;
  }
  /* "amount" adds up (a sum), "rate" does not (the rest shows an average) */
  const bar = (top, y) => Object.assign({ type: 'bar', x: 'cat', top: top }, y ? { y: y === 'v' ? 'amount' : y } : {});

  /* 1. rest identity and conservation */
  conserved('real Other only', [{ cat: 'Other', v: 100 }, { cat: 'A', v: 90 }], bar(2, 'v'), { sum: 190, marks: [['Other', 1], ['A', 1]] });
  conserved('overflow only', [{ cat: 'A', v: 100 }, { cat: 'B', v: 90 }, { cat: 'C', v: 80 }, { cat: 'D', v: 70 }], bar(2, 'v'), { sum: 340, marks: [['Others', 2]] });
  conserved('real Other and overflow', [{ cat: 'Other', v: 100 }, { cat: 'A', v: 90 }, { cat: 'B', v: 80 }, { cat: 'C', v: 70 }], bar(2, 'v'), { sum: 340, marks: [['Other', 1], ['Others', 2]] });
  conserved('real Other low, folded into the rest', [{ cat: 'Other', v: 1 }, { cat: 'A', v: 100 }, { cat: 'B', v: 90 }, { cat: 'C', v: 80 }], bar(2, 'v'), { sum: 271, marks: [['Others', 2]] });
  const seven = [...Array(3)].map(() => ({ cat: 'Other' })).concat([...Array(2)].map(() => ({ cat: 'Others' })), [{ cat: 'A' }, { cat: 'B' }]);
  conserved('count: real Other and real Others with overflow (review finding)', seven, bar(2), { sum: 7, marks: [['Other', 3], ['Others', 2], ['All others', 2]] });
  conserved('real "All others" too', seven.concat([{ cat: 'All others' }, { cat: 'All others' }, { cat: 'All others' }, { cat: 'All others' }]), bar(3),
    { sum: 11, marks: [['All others', 4], ['Other', 3], ['Others', 2], ['All others (2)', 2]] });
  const avg = [{ cat: 'Others, average', rate: 9 }, { cat: 'A', rate: 5 }, { cat: 'B', rate: 3 }, { cat: 'C', rate: 1 }];
  conserved('real "Others, average" with an averaged rest', avg, bar(2, 'rate'), { marks: [['Others, average', 1], ['All others, average', 2]] });
  conserved('blank and missing', [{ cat: 'Other', v: 100 }, { cat: '', v: 90 }, { v: 80 }, { cat: 'C', v: 70 }, { cat: 'D', v: 1 }], bar(2, 'v'),
    { sum: 341, marks: [['Other', 1], ['(blank)', 2], ['Others', 2]] });
  conserved('grouped bars', [{ cat: 'Other', g: 'red', v: 100 }, { cat: 'A', g: 'red', v: 90 }, { cat: 'B', g: 'blue', v: 80 }, { cat: 'C', g: 'blue', v: 70 }],
    { type: 'bar', x: 'cat', y: 'amount', color: 'g', stack: 'group', top: 2 }, { sum: 340 });
  {
    /* duplicate labels: many rows per real category, several categories that look like the rest's label */
    const rows = [];
    ['Other', 'Others', 'Other', 'X', 'Others', 'Y', 'Z', 'Other', 'W'].forEach((c, i) => rows.push({ cat: c, v: i + 1 }));
    conserved('duplicate labels', rows, bar(3, 'v'), { sum: 45 });
  }
  {
    /* any input order gives the same marks (label, rows, value) */
    const base = [{ cat: 'Other', v: 5 }, { cat: 'Others', v: 4 }, { cat: 'A', v: 9 }, { cat: 'B', v: 1 }, { cat: 'C', v: 2 }, { cat: '', v: 3 }, { v: 7 }];
    const sig = (rows) => make(rows.map((r) => Object.assign({ amount: r.v }, r)), bar(3, 'v')).marks.map((m) => label(m) + '=' + value(m) + '/' + m.rows.map((r) => rows[r].cat + ':' + rows[r].v).sort().join(',')).sort().join(' ; ');
    const want = sig(base);
    let seed = 7, same = true;
    for (let k = 0; k < 24; k++) {
      const r = base.slice(); for (let i = r.length - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = seed % (i + 1); [r[i], r[j]] = [r[j], r[i]]; }
      if (sig(r) !== want) { same = false; console.log('order', k, sig(r)); }
    }
    ok(same, 'top-N marks do not depend on input order: ' + want);
  }
  {
    /* line chart color cap (12 groups) with a real Other series: both kept, distinct legend names, every row in a line */
    const rows = [];
    for (let g = 0; g < 16; g++) for (let t = 0; t < 3; t++) rows.push({ t: t, y: (16 - g) * 10 + t, g: g === 0 ? 'Other' : 'g' + g });
    const s = make(rows, { type: 'line', x: 't', y: 'y', color: 'g' }), names = s.legend.map((l) => l.t), keys = s.legend.map((l) => l.key);
    ok(names.includes('Other') && names.includes('All other'), 'line legend keeps the real Other and names the rest All other: ' + names.join(','));
    ok(new Set(names).size === names.length && new Set(keys).size === keys.length, 'line legend names and keys are distinct');
  }
  {
    /* serialization: scene JSON and SVG carry the labels as text and the rows unchanged */
    const s = make(seven, bar(2)), j = JSON.parse(JSON.stringify(s.marks));
    ok(j.length === s.marks.length && j.every((m, i) => m.t === s.marks[i].t && JSON.stringify(m.rows) === JSON.stringify(s.marks[i].rows)), 'marks survive a JSON round trip');
    ok(!JSON.stringify(s).includes('[object'), 'scene JSON has no object-as-text');
    const svg = P.toSvg(seven, bar(2));
    ok(/>All others</.test(svg) && />Others</.test(svg) && />Other</.test(svg) && !svg.includes('[object'), 'SVG names Other, Others and All others as text');
  }
  {
    /* donut cap with a real Other: own wedge, rest reads All other, values add up */
    const rows = [{ cat: 'Other', v: 100 }]; for (let i = 0; i < 30; i++) rows.push({ cat: 'c' + i, v: 1 });
    conserved('donut cap with real Other', rows, { type: 'donut', x: 'cat', y: 'v' }, { sum: 130, marks: [['Other', 1], ['All other', 20]] });
  }

  /* 2. donut wedges after SVG rounding */
  function svgPieces(svg) {
    /* every <path d="M..L..Z"> subpath with its fill, coordinates as written (two decimals) */
    const out = [], re = /<path d="([^"]+)" fill="([^"]+)"/g; let m;
    while ((m = re.exec(svg))) for (const sub of m[1].split('M').filter(Boolean)) {
      const nums = sub.replace(/Z/g, '').split(/[L ]/).filter(Boolean).map(Number), pts = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      out.push({ fill: m[2], pts: pts });
    }
    return out;
  }
  const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
  const decimals = (svg) => /<path d="[^"]*\d\.\d{3}/.test(svg);
  function donut(name, rows, o) {
    o = o || W;
    const spec = { type: 'donut', x: 'cat', y: 'v' }, s = make(rows, spec, o), svg = P.toSvg(rows, spec, o), pieces = svgPieces(svg);
    const wedges = s.marks.filter((m) => m.wedge), positive = rows.filter((r) => r.v > 0).length;
    ok(!decimals(svg), name + ': SVG coordinates are written to at most two decimals');
    ok(pieces.length > 0 && pieces.every((p) => area(p.pts) > 0), name + ': every written wedge piece has area after rounding (min ' + Math.min(...pieces.map((p) => area(p.pts))).toFixed(3) + ' px²)');
    /* each wedge: its color's pieces, rounded, add up to a clearly positive area */
    const byFill = new Map(); pieces.forEach((p) => byFill.set(p.fill, (byFill.get(p.fill) || 0) + area(p.pts)));
    ok([...byFill.values()].every((a) => a >= 10), name + ': every wedge color covers at least 10 px² as written');
    /* at least MIN_ARC px at the rim (outer arc length), ordered, no overlap, ring closes */
    let prev = -Infinity, fine = true, total = 0;
    wedges.forEach((m) => { const w = m.wedge, arc = (w[5] - w[4]) * w[3]; if (!(arc >= 1 - 1e-9) || w[4] < prev - 1e-9) fine = false; prev = w[5]; total += w[5] - w[4]; });
    ok(fine, name + ': every wedge is at least 1 px wide at the rim, in order, without overlap');
    if (wedges.length > 1) {
      const w0 = wedges[0].wedge, wl = wedges[wedges.length - 1].wedge, pad = w0[4] + Math.PI / 2;
      ok(Math.abs(wl[5] + pad - (-Math.PI / 2 + 2 * Math.PI)) < 1e-9, name + ': the ring closes at the top');
    }
    return { s: s, wedges: wedges, positive: positive };
  }
  for (const big of [1e3, 1e6, 1e9, 1e12, 1e16, 1e20, 1e300]) {
    const r = donut('ratio ' + big + ':1', [{ cat: 'large', v: big }, { cat: 'tiny', v: 1 }]);
    const tiny = r.s.marks.find((m) => m.rows[0] === 1);
    ok(tiny && /\(<0\.1%\)/.test(tiny.t) === (big >= 2000) && / 1 \(/.test(tiny.t), 'ratio ' + big + ': tiny wedge text keeps the true value and an honest percent: ' + (tiny && tiny.t));
    ok(tiny && /minimum size/.test(tiny.t) === (big >= 1e3), 'ratio ' + big + ': a widened wedge says so: ' + (tiny && tiny.t));
    const large = r.s.marks.find((m) => m.rows[0] === 0);
    ok(large && !/\(100\.0%\)/.test(large.t), 'ratio ' + big + ': the large share never reads 100.0% while another share exists: ' + (large && large.t));
  }
  {
    const rows = [{ cat: 'large', v: 1e6 }].concat(Array.from({ length: 11 }, (_, i) => ({ cat: 'tiny' + i, v: 1 + i * 1000 })));
    const r = donut('adjacent small wedges', rows);
    ok(r.wedges.length === 12, 'adjacent small wedges: 12 wedges');
    const spans = r.wedges.map((m) => ({ v: rows[m.rows[0]].v, a: m.wedge[5] - m.wedge[4] }));
    ok(spans.every((p, i) => spans.every((q) => p.v <= q.v || p.a >= q.a - 1e-12)), 'adjacent small wedges: a bigger value never draws a narrower wedge');
  }
  {
    /* proportional meaning: wedges that are not widened keep their relative sizes exactly */
    const rows = [{ cat: 'a', v: 500 }, { cat: 'b', v: 300 }, { cat: 'c', v: 200 }, { cat: 'tiny', v: 1e-9 }];
    const r = donut('proportions kept', rows), sp = (n) => { const m = r.wedges.find((w) => label(w) === n); return m.wedge[5] - m.wedge[4]; };
    const pad = 2 * (r.wedges[0].wedge[4] + Math.PI / 2);
    ok(Math.abs((sp('a') + pad) / (sp('b') + pad) - 5 / 3) < 1e-9 && Math.abs((sp('b') + pad) / (sp('c') + pad) - 3 / 2) < 1e-9, 'unwidened wedges keep their exact ratios');
    ok((sp('a') + pad) / (2 * Math.PI) > 0.5 * (1 - 0.025), 'distortion of a big share stays under 2.5% (a is ' + ((sp('a') + pad) / (2 * Math.PI) * 100).toFixed(3) + '% vs 50%)');
  }
  for (const [w, h] of [[200, 160], [333, 257], [600, 400], [601.005, 399.995], [1000, 1000], [123.45, 678.9]]) {
    donut('size ' + w + 'x' + h, [{ cat: 'large', v: 1e9 }, { cat: 'mid', v: 3 }, { cat: 'tiny', v: 1 }], { width: w, height: h });
  }
  {
    const one = donut('one category (full circle)', [{ cat: 'all', v: 7 }]);
    const w = one.wedges[0].wedge;
    ok(one.wedges.length === 1 && Math.abs(w[5] - w[4] - 2 * Math.PI) < 1e-12, 'one category draws the full circle');
    const z = make([{ cat: 'large', v: 100 }, { cat: 'zero', v: 0 }, { cat: 'neg', v: -5 }], { type: 'donut', x: 'cat', y: 'v' });
    ok(z.marks.filter((m) => m.wedge).length === 1, 'zero and negative shares draw no wedge');
    donut('two equal halves', [{ cat: 'a', v: 1 }, { cat: 'b', v: 1 }]);
  }
  {
    const rows = []; for (let i = 0; i < 1000; i++) rows.push({ cat: 'k' + i, v: Math.pow(i + 1, -2.5) * 1e6 });
    const r = donut('1,000 categories (power law)', rows);
    ok(r.wedges.length === 12 && rowsOf(r.s).length === 1000, 'many categories: 11 wedges and the rest, all 1,000 rows kept');
  }
  /* 3. small charts (found by tests/netflow-plot-wedges-raster-browser.js): the ring keeps a real size, the total leaves the hole when it does not fit */
  for (const [w, h] of [[160, 120], [200, 150], [240, 170]]) {
    const rows = [{ cat: 'Big', v: 1e7 }, { cat: 't0', v: 1 }, { cat: 't1', v: 1 }], spec = { type: 'donut', x: 'cat', y: 'v' }, o = { width: w, height: h };
    const s = make(rows, spec, o), ws = s.marks.filter((m) => m.wedge).map((m) => m.wedge);
    ok(ws.length === 3 && ws.every((x) => x[3] >= 10 && x[2] > 0 && x[3] > x[2]), w + ' x ' + h + ': ring radius ' + (ws[0] && ws[0][3].toFixed(1)) + ' px, positive and not inside out');
    const svg = P.toSvg(rows, Object.assign({}, spec, o)), hole = ws[0][2], inHole = (svg.match(/<text [^>]*font-size="22"[^>]*>[^<]*</g) || []);
    ok(inHole.length === 0 || 3 * 0.6 * 22 / 2 <= hole * 0.9, w + ' x ' + h + ': the total is drawn in the hole only when it fits (hole ' + hole.toFixed(1) + ' px)');
    ok(!/>Big 100%</.test(svg), w + ' x ' + h + ': the big share is not labeled 100% while others exist');
  }
};
if (require.main === module) {
  global.NetflowScene = require('../../netflow-scene/netflow-scene.js');
  let fails = 0, checks = 0;
  module.exports(require('../netflow-plot.js'), global.NetflowScene, (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } });
  console.log(fails ? fails + ' of ' + checks + ' checks failed' : checks + ' checks passed');
  process.exit(fails ? 1 : 0);
}
