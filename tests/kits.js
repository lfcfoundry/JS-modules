// Runs the per-module tests of every module with its own test/ folder, plus lzma-pack, single-file-tools, fuzz-kit, canvas-probe, storage-probe and the house-rule hooks.
// Needs node and python3; the browser parts need Playwright for Python with Chromium. The Firefox step (tests/firefox.js) runs only if puppeteer-core and Firefox are found. Use --quick to skip browser parts.
var cp = require('child_process'), path = require('path');
var root = path.resolve(__dirname, '..');
var quick = process.argv.indexOf('--quick') > 0;
var steps = [
  ['frame-kit', 'node', ['modules/frame-kit/test/run.js']],
  ['sprite-baker', 'node', ['modules/sprite-baker/test/run.js']],
  ['lzma-decode', 'node', ['modules/lzma-decode/test/run.js']],
  ['ppmd-decode', 'node', ['modules/ppmd-decode/test/run.js']],
  ['fuzz-kit engine', 'node', ['tools/fuzz-kit/test/run.js']],
  ['canvas-probe', 'node', ['tools/canvas-probe/test/run.js']],
  ['wake-keeper', 'node', ['modules/wake-keeper/test/run.js']],
  ['stage-curtains', 'node', ['modules/stage-curtains/test/run.js']],
  ['fly-to-mini', 'node', ['modules/fly-to-mini/test/run.js']],
  ['sticker-text', 'node', ['modules/sticker-text/test/run.js']],
  ['cartoon-3d-kit', 'node', ['modules/cartoon-3d-kit/test/run.js']],
  ['env-probes', 'node', ['modules/env-probes/test/run.js']],
  ['fx-governor', 'node', ['modules/fx-governor/test/run.js']],
  ['hold-press', 'node', ['modules/hold-press/test/run.js']],
  ['back-close node', 'node', ['modules/back-close/test/run.js']],
  ['pad-nav node', 'node', ['modules/pad-nav/test/run.js']],
  ['save-kit', 'node', ['modules/save-kit/test/run.js']],
  ['tab-guard node', 'node', ['modules/tab-guard/test/run.js']],
  ['idle-core', 'node', ['modules/idle-core/test/run.js']],
  ['lzma-pack python', 'python3', ['tools/lzma-pack/test/run.py']],
  ['ppmd-pack python', 'python3', ['tools/ppmd-pack/test/run.py']],
  ['single-file-tools', 'python3', ['tools/single-file-tools/test/run.py']],
  ['fuzz-kit runner (fake page)', 'python3', ['tools/fuzz-kit/test/runner_fakes.py']],
  ['house-rule hooks', 'sh', ['tools/hooks/test.sh']],
  ['tab-guard', 'python3', ['modules/tab-guard/test/run.py'], true],
  ['back-close', 'python3', ['modules/back-close/test/run.py'], true],
  ['pad-nav', 'python3', ['modules/pad-nav/test/run.py'], true],
  ['frame-kit demo', 'python3', ['modules/frame-kit/test/check-example.py'], true],
  ['lzma-pack', 'python3', ['tools/lzma-pack/test/browser.py'], true],
  ['ppmd-pack', 'python3', ['tools/ppmd-pack/test/browser.py'], true],
  ['fuzz-kit browser', 'python3', ['tools/fuzz-kit/test/browser.py'], true],
  ['canvas-probe browser', 'python3', ['tools/canvas-probe/test/browser.py'], true],
  ['storage-probe browser', 'python3', ['tools/storage-probe/test/run.py'], true],
  ['firefox', 'node', ['tests/firefox.js'], true, true]      // fifth item: optional, skipped when puppeteer-core or Firefox is missing (exit code 2)
];
var failed = 0;
steps.forEach(function (s) {
  if (quick && s[3]) { console.log('skip  ' + s[0]); return; }
  var r = cp.spawnSync(s[1], s[2], { cwd: root, encoding: 'utf8' });
  if (s[4] && r.status === 2) { console.log('skip  ' + s[0] + ' (needs puppeteer-core and Firefox; see tests/firefox.js)'); return; }
  var ok = r.status === 0;
  if (!ok) failed++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + s[0] + (ok ? '' : '\n' + (r.stdout || '') + (r.stderr || '')));
});
console.log(failed ? failed + ' step(s) failed' : 'all steps passed');
process.exit(failed ? 1 : 0);
