// Copyright (c) 2026 LFC Foundry. MIT License.
// save-kit.min.js is save-kit.js minified (since 2.4.1). Checks that it is up to date (same Version line, ASCII only, MIT header kept),
// then runs every check in run.js against it. Rebuild after any change to save-kit.js:
//   terser modules/save-kit/save-kit.js -c passes=2 -m -f ascii_only=true -o modules/save-kit/save-kit.min.js   (terser 5)
const assert = require('assert'), fs = require('fs'), path = require('path'), cp = require('child_process');
const dir = path.join(__dirname, '..'), src = fs.readFileSync(path.join(dir, 'save-kit.js'), 'utf8'), min = fs.readFileSync(path.join(dir, 'save-kit.min.js'), 'utf8');
const ver = s => (s.match(/Version \d+\.\d+\.\d+ \(API \d+\)/) || [])[0];
assert.ok(ver(src), 'save-kit.js has a Version line');
assert.strictEqual(ver(min), ver(src), 'save-kit.min.js is stale: rebuild it (see the top of this file)');
assert.ok(/Copyright \(c\) 2026 LFC Foundry\. MIT License/.test(min.slice(0, 600)), 'MIT header kept');
assert.ok(![...min].some(c => c.charCodeAt(0) > 255), 'ASCII only (no character above U+00FF)');
assert.ok(min.length < src.length * 0.6, 'really minified');
const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'run.js')], { env: Object.assign({}, process.env, { SAVEKIT_FILE: path.join(dir, 'save-kit.min.js') }), encoding: 'utf8' });
process.stdout.write(r.stdout); process.stderr.write(r.stderr);
assert.strictEqual(r.status, 0, 'run.js passes on save-kit.min.js');
console.log('min: up to date, ASCII only, header kept, run.js passes on it');
