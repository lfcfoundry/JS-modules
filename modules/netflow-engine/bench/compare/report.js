#!/usr/bin/env node
// Turns the four result files of run.js into plain markdown tables. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node report.js <folder with chromium.json firefox.json webkit.json epiphany.json>
'use strict';
const fs = require('fs'), path = require('path'), dir = process.argv[2];
const B = [['chromium', 'ungoogled-chromium'], ['firefox', 'Firefox'], ['webkit', 'WebKitGTK'], ['epiphany', 'GNOME Web']];
const data = {}; for (const [k] of B) { const f = path.join(dir, k + '.json'); if (fs.existsSync(f)) data[k] = JSON.parse(fs.readFileSync(f, 'utf8')); }
const names = { engine: 'Netflow engine', d3: 'd3-force', cytoscape: 'Cytoscape (cose)', dagre: 'dagre', elk: 'ELK' };
const taskNames = { force: 'Force (springs), network', stress: 'Distances (stress), network', layered: 'Layered, top to bottom' };
const ms = (x) => x == null ? '-' : x >= 10000 ? (x / 1000).toFixed(1) + ' s' : Math.round(x).toLocaleString('en-US') + ' ms';
const q = (r, t) => r.quality == null ? '-' : t === 'layered' ? Math.round(r.quality).toLocaleString('en-US') : r.quality.toFixed(3);
const cell = (k, task, n, lib) => { const d = data[k]; if (!d) return 'not run'; const r = d.table.find((x) => x.task === task && x.n === n && x.lib === lib);
  if (!r || !r.runs) return d.slow.includes(`${lib}|${task}|${n}`) ? 'over 60 s' : 'not run'; return ms(r.cold) + (r.runs === 1 ? ' (1 run)' : ''); };
const out = [];
for (const k of Object.keys(data)) out.push(`- ${B.find((b) => b[0] === k)[1]} ${data[k].version}, ${data[k].reps} fresh-page runs per case (median; a case over 20 s ran once), limit ${data[k].limitSeconds} s per case.`);
const first = data[Object.keys(data)[0]];
for (const task of ['force', 'stress', 'layered']) {
  out.push('', `### ${taskNames[task]}`, '', `First layout in a fresh page, lower is better. Quality (${task === 'layered' ? 'crossing link pairs' : 'stress'}, lower is better) from ${B.find((b) => b[0] === Object.keys(data)[0])[1]}; median over the runs.`, '',
    '| Items | Library | ' + B.filter((b) => data[b[0]]).map((b) => b[1]).join(' | ') + ' | Quality |', '|---|---|' + B.filter((b) => data[b[0]]).map(() => '---').join('|') + '|---|');
  for (const n of first.sizes) for (const lib of [...new Set(first.table.filter((r) => r.task === task).map((r) => r.lib))]) {
    const r = first.table.find((x) => x.task === task && x.n === n && x.lib === lib);
    const anyQ = Object.keys(data).map((k) => data[k].table.find((x) => x.task === task && x.n === n && x.lib === lib)).find((x) => x && x.quality != null);
    out.push(`| ${n.toLocaleString('en-US')} | ${names[lib]} | ` + B.filter((b) => data[b[0]]).map((b) => cell(b[0], task, n, lib)).join(' | ') + ` | ${anyQ ? q(anyQ, task) : '-'} |`);
  }
}
console.log(out.join('\n'));
