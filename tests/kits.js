// Runs the per-module tests of frame-kit, sprite-baker, pad-nav, lzma-decode/lzma-pack, fuzz-kit and canvas-probe.
// Needs node and python3; the browser parts need Playwright for Python with Chromium. Use --quick to skip browser parts.
var cp = require('child_process'), path = require('path');
var root = path.resolve(__dirname, '..');
var quick = process.argv.indexOf('--quick') > 0;
var steps = [
  ['frame-kit', 'node', ['modules/frame-kit/test/run.js']],
  ['sprite-baker', 'node', ['modules/sprite-baker/test/run.js']],
  ['lzma-decode', 'node', ['modules/lzma-decode/test/run.js']],
  ['fuzz-kit engine', 'node', ['tools/fuzz-kit/test/run.js']],
  ['canvas-probe', 'node', ['tools/canvas-probe/test/run.js']],
  ['pad-nav', 'python3', ['modules/pad-nav/test/run.py'], true],
  ['frame-kit demo', 'python3', ['modules/frame-kit/test/check-example.py'], true],
  ['lzma-pack', 'python3', ['tools/lzma-pack/test/browser.py'], true],
  ['fuzz-kit browser', 'python3', ['tools/fuzz-kit/test/browser.py'], true],
  ['canvas-probe browser', 'python3', ['tools/canvas-probe/test/browser.py'], true]
];
var failed = 0;
steps.forEach(function (s) {
  if (quick && s[3]) { console.log('skip  ' + s[0]); return; }
  var r = cp.spawnSync(s[1], s[2], { cwd: root, encoding: 'utf8' });
  var ok = r.status === 0;
  if (!ok) failed++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + s[0] + (ok ? '' : '\n' + (r.stdout || '') + (r.stderr || '')));
});
console.log(failed ? failed + ' step(s) failed' : 'all steps passed');
process.exit(failed ? 1 : 0);
