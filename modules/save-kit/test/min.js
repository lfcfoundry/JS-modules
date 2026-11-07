// Copyright (c) 2026 LFC Foundry. MIT License.
// The minified files (since 2.4.1 save-kit.min.js, since 2.5.0 save-kit-small.min.js). Checks each is up to date (same Version line as
// save-kit.js), ASCII only and keeps the MIT header, then runs every check in run.js that applies to it. Rebuild after any change to save-kit.js
// (terser 5, from the repository root):
//   terser modules/save-kit/save-kit.js -c passes=2 -m -f ascii_only=true -o modules/save-kit/save-kit.min.js
//   python3 modules/save-kit/lean.py --without codes,compact,nativeBase64,streamLimit,large,durable -o /tmp/save-kit-small.js
//   terser /tmp/save-kit-small.js -c passes=2 -m -f ascii_only=true -o modules/save-kit/save-kit-small.min.js
const assert = require('assert'), fs = require('fs'), path = require('path'), cp = require('child_process');
const dir = path.join(__dirname, '..'), src = fs.readFileSync(path.join(dir, 'save-kit.js'), 'utf8');
const ver = s => (s.match(/Version \d+\.\d+\.\d+ \(API \d+\)/) || [])[0];
const SMALL_CUT = 'codes,compact,nativeBase64,streamLimit,large,durable';
const files = [{ name: 'save-kit.min.js', without: '' }, { name: 'save-kit-small.min.js', without: SMALL_CUT }];
assert.ok(ver(src), 'save-kit.js has a Version line');
for (const f of files) {
  const p = path.join(dir, f.name), min = fs.readFileSync(p, 'utf8');
  assert.strictEqual(ver(min), ver(src), f.name + ' is stale: rebuild it (see the top of this file)');
  assert.ok(/Copyright \(c\) 2026 LFC Foundry\. MIT License/.test(min.slice(0, 600)), f.name + ': MIT header kept');
  assert.ok(![...min].some(c => c.charCodeAt(0) > 255), f.name + ': ASCII only (no character above U+00FF)');
  assert.ok(min.length < src.length * 0.6, f.name + ': really minified');
  if (f.without) { const S = require(p); assert.strictEqual(typeof S.create, 'function', f.name + ': has create()'); assert.strictEqual(S.createLarge, undefined, f.name + ': big saves are cut'); }
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'run.js')], { env: Object.assign({}, process.env, { SAVEKIT_FILE: p, SAVEKIT_WITHOUT: f.without, OLD_REF: 'none' }), encoding: 'utf8' });
  if (r.status !== 0) { process.stdout.write(r.stdout); process.stderr.write(r.stderr); }
  assert.strictEqual(r.status, 0, 'run.js passes on ' + f.name);
  console.log('min: ' + f.name + ' up to date, ASCII only, header kept; ' + r.stdout.trim().split('\n').pop());
}
