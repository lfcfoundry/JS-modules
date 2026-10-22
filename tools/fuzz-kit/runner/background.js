#!/usr/bin/env node
// Hunts bugs in the background: runs the fuzz-kit runner over many seeds, one browser at a time, at the lowest priority, and writes what it finds to a folder.
// Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules
//   node runner/background.js start URL ADAPTER.js [--browsers chrome,firefox] [--seeds 1-200] [--batch 10] [--ops 400] [--out DIR]
//       [--chrome PATH] [--firefox PATH] [--seed-secs 120] [-- more options for fuzz_puppeteer.mjs]
//   node runner/background.js status DIR    plain-words progress (also prints the findings so far)
//   node runner/background.js stop DIR      stops after the seed in progress (kills the browser run, keeps what was found)
// `start` prints the folder and returns at once; the hunt carries on without the terminal. In the folder: run.log (everything printed), state.json (progress),
// findings.md (written after every batch: each failing seed with its words), bundles/ (the saved page data and shrunk script of each failing seed), and
// DONE (written last; its text says how it ended). Nothing is left running after DONE. No packages of its own: it starts runner/fuzz_puppeteer.mjs.
// WebKitGTK and GNOME Web are not hunted yet: Puppeteer cannot drive them and tools/webkit-driver has no Puppeteer-style browser object. They are listed as "not run".
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const RUNNER = path.join(__dirname, 'fuzz_puppeteer.mjs');
const SUPPORTED = ['chrome', 'firefox'], NOT_YET = ['webkitgtk', 'epiphany'];

function parseSeeds(spec) {   // '1-5,9' -> [1,2,3,4,5,9]
  const out = [];
  String(spec).split(',').forEach(function (part) { const p = part.trim().split('-').map(Number), a = p[0], b = p[1] || a; for (let k = a; k <= b; k++) out.push(k); });
  return out;
}
function batches(seeds, size) { const out = []; for (let i = 0; i < seeds.length; i += size) out.push(seeds.slice(i, i + size)); return out; }
/** Reads the runner's printed lines: the failing seeds with their first words, and the totals. */
function readLog(text) {
  const fails = [], lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^ FAIL seed (\d+): (\d+) finding\(s\) after (\d+) ops/.exec(lines[i]);
    if (m) { const words = []; for (let j = i + 1; j < lines.length && /^ {6}/.test(lines[j]); j++) words.push(lines[j].trim().slice(0, 400)); fails.push({ seed: +m[1], findings: +m[2], ops: +m[3], words: words }); }
  }
  const v = /^browser: (.+)$/m.exec(String(text)), oks = (String(text).match(/^ ok {3}seed /mg) || []).length;
  return { fails: fails, ok: oks, version: v ? v[1].trim() : null };
}
function findingsMd(state) {
  const out = ['# fuzz-kit background hunt', '', state.url + ' · adapter ' + state.adapter + ' · ' + state.ops + ' ops per seed', ''];
  out.push('| Browser | Version | Seeds run | Clean | With findings | State |', '|---|---|---|---|---|---|');
  state.browsers.forEach(function (b) { out.push('| ' + [b.name, b.version || 'not measured', b.run, b.ok, b.fails.length, b.state].join(' | ') + ' |'); });
  NOT_YET.forEach(function (n) { out.push('| ' + n + ' | | 0 | 0 | 0 | not run: no way to drive it from this runner yet |'); });
  out.push('');
  const any = state.browsers.some(function (b) { return b.fails.length; });
  if (!any) out.push('No findings so far.');
  state.browsers.forEach(function (b) {
    b.fails.forEach(function (f) { out.push('## ' + b.name + ' seed ' + f.seed + ' (' + f.findings + ' finding(s) after ' + f.ops + ' ops)', '', '```'); f.words.forEach(function (w) { out.push(w); }); out.push('```', ''); });
  });
  out.push('Replay one: `node runner/fuzz_puppeteer.mjs URL ADAPTER --browser <name> --seeds <seed> --shrink`; saved data is in bundles/.');
  return out.join('\n') + '\n';
}
function statusWords(state, done) {
  const L = [(done ? 'finished: ' + done.trim() : state.stopped ? 'stopping' : 'running') + ' · started ' + state.started];
  state.browsers.forEach(function (b) { L.push('  ' + b.name + (b.version ? ' ' + b.version : '') + ': ' + b.state + ', ' + b.run + ' of ' + b.total + ' seeds run, ' + b.fails.length + ' with findings'); });
  const n = state.browsers.reduce(function (a, b) { return a + b.fails.length; }, 0);
  L.push(n ? n + ' seed(s) with findings: see findings.md' : 'no findings so far');
  return L.join('\n');
}
const read = function (f, d) { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return d; } };
const readState = function (dir) { try { return JSON.parse(read(path.join(dir, 'state.json'), '')); } catch (e) { return null; } };

function opt(args, name, def) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; }

function start(args) {
  const rest = args.indexOf('--') >= 0 ? args.slice(args.indexOf('--') + 1) : [], own = args.indexOf('--') >= 0 ? args.slice(0, args.indexOf('--')) : args;
  const pos = own.filter(function (x, i) { return !x.startsWith('--') && !(i > 0 && own[i - 1].startsWith('--')); });
  if (pos.length < 2) { console.error('usage: node runner/background.js start URL ADAPTER.js [--browsers chrome,firefox] [--seeds 1-200] [--batch 10] [--ops 400] [--out DIR]'); process.exit(2); }
  const browsers = opt(own, 'browsers', 'chrome,firefox').split(',').filter(Boolean), bad = browsers.filter(function (b) { return SUPPORTED.indexOf(b) < 0; });
  if (bad.length) { console.error('cannot hunt in: ' + bad.join(', ') + (bad.some(function (b) { return NOT_YET.indexOf(b) >= 0; }) ? ' (WebKitGTK and GNOME Web are not supported by this runner yet)' : '') + '. Choose from ' + SUPPORTED.join(', ')); process.exit(2); }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13), out = path.resolve(opt(own, 'out', path.join(os.tmpdir(), 'fuzz-bg-' + stamp)));
  fs.mkdirSync(path.join(out, 'bundles'), { recursive: true });
  const cfg = { url: pos[0], adapter: path.resolve(pos[1]), browsers: browsers, seeds: parseSeeds(opt(own, 'seeds', '1-200')), batch: +opt(own, 'batch', 10), ops: +opt(own, 'ops', 400),
    seedSecs: +opt(own, 'seed-secs', 120), executables: { chrome: opt(own, 'chrome', process.env.CHROME), firefox: opt(own, 'firefox', process.env.FIREFOX) }, extra: rest, out: out };
  fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify(cfg, null, 1));
  const log = fs.openSync(path.join(out, 'run.log'), 'a');
  const child = cp.spawn(process.execPath, [__filename, '_worker', out], { detached: true, stdio: ['ignore', log, log], env: process.env });
  child.unref();
  fs.writeFileSync(path.join(out, 'pid'), String(child.pid));
  console.log('fuzz hunt started in the background: ' + out + '\n  watch: node ' + path.relative(process.cwd(), __filename) + ' status ' + out + '\n  stop:  node ' + path.relative(process.cwd(), __filename) + ' stop ' + out);
}

function runBatch(cfg, name, seeds, dir, stopFlag) {   // one runner process for a few seeds; resolves with its printed text
  return new Promise(function (res) {
    const a = [RUNNER, cfg.url, cfg.adapter, '--browser', name, '--seeds', seeds.join(','), '--ops', String(cfg.ops), '--seed-secs', String(cfg.seedSecs), '--shrink', '--bundle', path.join(dir, 'bundles', name)];
    if (cfg.executables[name]) a.push('--executable', cfg.executables[name]);
    const pr = cp.spawn(process.execPath, a.concat(cfg.extra), { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let text = ''; const add = function (d) { text += d; fs.appendFileSync(path.join(dir, 'run.log'), d); };
    pr.stdout.on('data', add); pr.stderr.on('data', add);
    const timer = setInterval(function () { if (fs.existsSync(stopFlag)) pr.kill('SIGTERM'); }, 1000);
    pr.on('close', function (code) { clearInterval(timer); res({ text: text, code: code }); });
    pr.on('error', function (e) { clearInterval(timer); res({ text: 'could not start the runner: ' + e + '\n', code: 1 }); });
  });
}

async function worker(dir) {
  const cfg = JSON.parse(read(path.join(dir, 'config.json'), '{}')), stopFlag = path.join(dir, 'STOP');
  try { os.setPriority(0, 19); } catch (e) { /* not allowed here: carry on at normal priority */ }
  const state = { url: cfg.url, adapter: path.basename(cfg.adapter), ops: cfg.ops, started: new Date().toISOString(), stopped: false,
    browsers: cfg.browsers.map(function (n) { return { name: n, version: null, total: cfg.seeds.length, run: 0, ok: 0, fails: [], state: 'waiting' }; }) };
  const save = function () { fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 1)); fs.writeFileSync(path.join(dir, 'findings.md'), findingsMd(state)); };
  save();
  let ended = 'all seeds run';
  for (const b of state.browsers) {
    const parts = batches(cfg.seeds, cfg.batch); b.state = 'running'; save();
    for (const seeds of parts) {
      if (fs.existsSync(stopFlag)) { state.stopped = true; break; }
      const r = await runBatch(cfg, b.name, seeds, dir, stopFlag), got = readLog(r.text);
      if (got.version) b.version = got.version;
      b.run += got.ok + got.fails.length; b.ok += got.ok; got.fails.forEach(function (f) { b.fails.push(f); });
      if (got.ok + got.fails.length === 0 && !fs.existsSync(stopFlag)) { b.state = 'could not run (exit ' + r.code + '): see run.log'; ended = 'a browser could not run, see run.log'; save(); break; }
      save();
    }
    if (state.stopped) { b.state = 'stopped'; break; }
    if (b.state === 'running') b.state = b.run === b.total ? 'done' : 'partly run';
    save();
  }
  if (state.stopped) ended = 'stopped on request';
  state.browsers.forEach(function (b) { if (b.state === 'waiting') b.state = 'not run'; });
  save();
  const n = state.browsers.reduce(function (a, b) { return a + b.fails.length; }, 0);
  fs.writeFileSync(path.join(dir, 'DONE'), ended + '; ' + n + ' seed(s) with findings; ' + new Date().toISOString() + '\n');
}

function status(dir) {
  const s = readState(dir); if (!s) { console.error('no hunt found in ' + dir); process.exit(2); }
  const done = read(path.join(dir, 'DONE'), null); console.log(statusWords(s, done));
  if (s.browsers.some(function (b) { return b.fails.length; })) console.log('\n' + read(path.join(dir, 'findings.md'), ''));
  process.exit(0);
}
function stop(dir) {
  if (!fs.existsSync(path.join(dir, 'config.json'))) { console.error('no hunt found in ' + dir); process.exit(2); }
  if (fs.existsSync(path.join(dir, 'DONE'))) { console.log('already finished: ' + read(path.join(dir, 'DONE'), '').trim()); return; }
  fs.writeFileSync(path.join(dir, 'STOP'), 'stop\n'); console.log('stop requested; the browser run ends within a few seconds and DONE appears');
}

if (require.main === module) {
  const a = process.argv.slice(2), cmd = a[0];
  if (cmd === 'start') start(a.slice(1)); else if (cmd === 'status') status(a[1]); else if (cmd === 'stop') stop(a[1]);
  else if (cmd === '_worker') worker(a[1]).catch(function (e) { fs.writeFileSync(path.join(a[1], 'DONE'), 'crashed: ' + e + '\n'); process.exit(1); });
  else { console.error('usage: node runner/background.js start|status|stop ...  (see the top of this file)'); process.exit(2); }
}
module.exports = { parseSeeds: parseSeeds, batches: batches, readLog: readLog, findingsMd: findingsMd, statusWords: statusWords };
