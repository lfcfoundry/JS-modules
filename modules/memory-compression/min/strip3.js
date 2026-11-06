// Step 4 of min/build.js: replaces the body of every function neither coverage run used with a throw ("only in the full file"). Copyright (c) 2026 LFC Foundry. MIT License.
const fs = require('fs'), acorn = require(process.env.MC_MIN_ACORN || 'acorn'); const src = fs.readFileSync(process.env.MC_MIN_TMP + '/lib.js', 'utf8'); const n = src.length;
const ast = acorn.parse(src, { ecmaVersion: 2022, ranges: true, allowReturnOutsideFunction: true });
// function nodes
const fnodes = []; (function walk(node) { if (!node || typeof node.type !== 'string') return; if (/^Function/.test(node.type) || node.type === 'ArrowFunctionExpression') fnodes.push([node.start, node.end, node.body.start, node.body.end]); for (const k in node) { const v = node[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); } })(ast);
// reported functions with count>0 (union of runs): key by start offset
const alive = new Set(); const reported = new Set();
for (const k of ['wasm', 'nowasm']) { const fns = JSON.parse(fs.readFileSync(process.env.MC_MIN_TMP + '/cov-' + k + '.json', 'utf8'))[0].functions; for (const f of fns) { const r = f.ranges[0]; reported.add(r.startOffset); if (r.count > 0) alive.add(r.startOffset); } }
// a function node is DEAD if not alive (never reported, or reported with 0 in both runs)
const dead = fnodes.filter(([s]) => !alive.has(s));
// the factory/top-level wrappers are alive since executed. Take outermost dead.
dead.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
let out = '', pos = 0, removed = 0, cnt = 0, lastEnd = -1, keep = 0;
for (const [s, e, bs, be] of dead) { if (s < lastEnd) continue; if (be - bs < 60) { continue; } out += src.slice(pos, bs + 1) + "throw new Error('memory-compression read-only build: this part is only in the full file');" ; pos = be - 1; removed += be - bs - 2; cnt++; lastEnd = e; }
out += src.slice(pos); fs.writeFileSync(process.env.MC_MIN_TMP + '/ro.js', out);
console.log('functions', fnodes.length, 'alive', alive.size, 'stubbed', cnt, 'bytes removed', removed, 'raw', n, '->', out.length);
