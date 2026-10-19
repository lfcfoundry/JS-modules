/* Copyright (c) 2026 LFC Foundry. MIT License. Skip a build whose inputs did not change.
     node tools/test-runner/stamp.js run <name> --in <file-or-folder>[,..] [--out <file>[,..]] -- <command...>
   Hashes the input files (names and bytes) plus the command; when the same hash was built before and every --out file still exists, it prints "skipped" and exits 0, else it runs the
   command and records the hash only when the command succeeds.   `build` below does this for every modules/<id>/wasm/ folder (clang build + embed).
     node tools/test-runner/stamp.js build [--force] [id ...]          --list shows what would run. Stamps live in .cache/test-runner/ (git-ignored). */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const root = path.resolve(__dirname, '..', '..'), cacheDir = process.env.TEST_RUNNER_CACHE || path.join(root, '.cache', 'test-runner');

function walk(p, out) {
  let st; try { st = fs.statSync(p); } catch (e) { return out; }
  if (st.isDirectory()) { for (const f of fs.readdirSync(p).sort()) { if (f === 'node_modules' || f === '.git') continue; walk(path.join(p, f), out); } } else out.push(p);
  return out;
}
/** A fingerprint of these files (their paths relative to the repository and their bytes) and an extra string such as the command. */
function hashInputs(inputs, extra) {
  const h = crypto.createHash('sha256'); h.update(String(extra || ''));
  for (const f of inputs.reduce((a, p) => walk(path.resolve(root, p), a), []).sort()) { h.update(path.relative(root, f)); h.update('\0'); h.update(fs.readFileSync(f)); h.update('\0'); }
  return h.digest('hex');
}
const stampFile = (name) => path.join(cacheDir, name.replace(/[^\w.-]/g, '_') + '.stamp');
/** Runs `argv` in `cwd` unless the inputs hash matches the last good build and all outputs exist. Returns { skipped, status, seconds }. */
function guarded(name, inputs, outputs, argv, cwd, force) {
  const hash = hashInputs(inputs, argv.join('\0')), f = stampFile(name);
  const outsOk = outputs.every((o) => fs.existsSync(path.resolve(root, o)));
  if (!force && outsOk && fs.existsSync(f) && fs.readFileSync(f, 'utf8') === hash) return { skipped: true, status: 0, seconds: 0 };
  const t0 = Date.now(), r = cp.spawnSync(argv[0], argv.slice(1), { cwd: cwd || root, stdio: 'inherit' });
  if (r.status === 0) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(f, hashInputs(inputs, argv.join('\0'))); }   // hashed again: a build may rewrite its own inputs (embed.py)
  return { skipped: false, status: r.status === null ? 1 : r.status, seconds: (Date.now() - t0) / 1000 };
}
/** Every module with a wasm/ folder that has build.sh and embed.py: its inputs, outputs and the commands. */
function wasmModules() {
  const out = [];
  for (const kind of ['modules', 'tools']) {
    const dir = path.join(root, kind); if (!fs.existsSync(dir)) continue;
    for (const id of fs.readdirSync(dir).sort()) {
      const w = path.join(dir, id, 'wasm'); if (!fs.existsSync(path.join(w, 'build.sh')) || !fs.existsSync(path.join(w, 'embed.py'))) continue;
      const rel = path.relative(root, w), wasms = fs.readdirSync(w).filter((f) => f.endsWith('.wasm')).map((f) => path.join(rel, f));
      out.push({ id, rel, inputs: fs.readdirSync(w).filter((f) => /\.(c|h|sh|py)$/.test(f)).map((f) => path.join(rel, f)), outputs: wasms });
    }
  }
  return out;
}
function main() {
  const a = process.argv.slice(2), cmd = a.shift();
  if (cmd === 'build') {
    const force = a.includes('--force'), list = a.includes('--list'), ids = a.filter((x) => !x.startsWith('--')), mods = wasmModules().filter((m) => !ids.length || ids.includes(m.id));
    let bad = 0, skipped = 0; const t0 = Date.now();
    for (const m of mods) {
      if (list) { console.log(m.id + ': ' + m.inputs.join(', ') + ' -> ' + m.outputs.join(', ')); continue; }
      const r = guarded('build-' + m.id, m.inputs, m.outputs, ['sh', '-c', 'sh build.sh && python3 embed.py'], path.join(root, m.rel), force);
      if (r.skipped) skipped++; if (r.status) bad++;
      console.log(m.id.padEnd(22) + (r.skipped ? 'skipped (inputs unchanged)' : r.status ? 'FAILED' : 'built in ' + r.seconds.toFixed(1) + ' s'));
    }
    if (!list) console.log(mods.length + ' wasm builds: ' + skipped + ' skipped, ' + (mods.length - skipped - bad) + ' built, ' + bad + ' failed; ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    process.exit(bad ? 1 : 0);
  }
  if (cmd === 'run') {
    const name = a.shift(), dd = a.indexOf('--'); if (!name || dd < 0) { console.log('usage: stamp.js run <name> --in <paths> [--out <files>] -- <command...>'); process.exit(2); }
    const opt = (n) => { const i = a.indexOf(n); return i >= 0 && i < dd ? a[i + 1].split(',') : []; }, r = guarded(name, opt('--in'), opt('--out'), a.slice(dd + 1), root, a.includes('--force'));
    console.log(r.skipped ? name + ': skipped (inputs unchanged)' : name + ': ' + (r.status ? 'FAILED' : 'built in ' + r.seconds.toFixed(1) + ' s')); process.exit(r.status);
  }
  console.log('usage: stamp.js build [--force|--list] [id...]   |   stamp.js run <name> --in <paths> [--out <files>] -- <command...>'); process.exit(2);
}
module.exports = { hashInputs, guarded, wasmModules };
if (require.main === module) main();
