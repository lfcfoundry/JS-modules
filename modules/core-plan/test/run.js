// core-plan checks (Node). Copyright (c) 2026 LFC Foundry. MIT License.
// The sizing rules on made-up devices (threads, memory), the sweep list, the label, and lastRun without sessionStorage (Node has none: every call is a quiet no-op).
'use strict';
const P = require('../core-plan.js');
let fails = 0, n = 0;
function eq(name, a, b) { n++; const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fails++; console.log('FAIL ' + name + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); } }
const T = (threads, mem, o) => P.plan(Object.assign({ env: P.detect({ hardwareConcurrency: threads, deviceMemory: mem }) }, o || {}));
eq('4 threads, 8 GB', [T(4, 8).cores, T(4, 8).workers], [4, 3]);
eq('8 threads: half assumed real cores', [T(8, 8).cores, T(8, 8).workers], [4, 3]);
eq('16 threads', [T(16, 8).workers, T(16, 8).sweep], [7, [1, 2, 4, 7]]);
eq('64 threads: capped at 8', [T(64, 8).workers, T(64, 8).why], [8, 'capped at 8']);
eq('maxWorkers', T(64, 8, { maxWorkers: 3 }).workers, 3);
eq('1 thread', [T(1, 0).workers, T(1, 0).sweep], [1, [1]]);
eq('2 threads, keepFree 0', T(2, 8, { keepFree: 0 }).workers, 2);
eq('2 GB phone, 8 threads', T(8, 2).workers, 3);
eq('1 GB: limited by memory', [T(4, 1).workers, T(4, 1).why], [2, 'limited by memory']);
eq('memory unknown counts as 4 GB', [T(32, undefined).workers, T(32, undefined, { workerMB: 512 }).workers], [8, 4]);
eq('DuckDB threads capped at 4', [T(32, 8).duckThreads, T(32, 8, { maxDuck: 2 }).duckThreads, T(4, 8).duckThreads], [4, 2, 3]);
eq('bad values fall back', [P.detect({ hardwareConcurrency: 'x' }).logical, P.detect({ hardwareConcurrency: -3 }).logical, P.detect({}).memGB], [4, 4, null]);
eq('label', T(8, 8).label, 'This device reports 8 threads (about 4 real cores assumed) and 8 GB. Plan: 3 helpers (cores minus 1).');
eq('label with DuckDB', T(16, 0, { maxDuck: 4 }).label, 'This device reports 16 threads (about 8 real cores assumed), memory not reported. Plan: 7 helpers, 4 DuckDB threads (cores minus 1).');
eq('label, one helper', T(1, 4).label, 'This device reports 1 thread (about 1 real core assumed) and 4 GB. Plan: 1 helper (cores minus 1).');
for (let t = 1; t <= 256; t++) for (const m of [0, 0.25, 0.5, 1, 2, 4, 8]) { const p = T(t, m); if (!(p.workers >= 1 && p.workers <= 8 && p.workers <= Math.max(1, p.cores - 1) && p.sweep[p.sweep.length - 1] === p.workers)) { fails++; console.log('FAIL bounds ' + t + ' threads ' + m + ' GB: ' + JSON.stringify(p)); } n++; }
P.lastRun.step('x'); eq('lastRun without sessionStorage', P.lastRun.previous(), '');
eq('plan() with no navigator', typeof P.plan().workers, 'number');
console.log(fails ? fails + ' of ' + n + ' FAILED' : 'core-plan: ' + n + ' checks passed');
process.exit(fails ? 1 : 0);
