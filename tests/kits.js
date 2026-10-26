// Runs the per-module tests of every module with its own test/ folder, plus lzma-pack, single-file-tools, fuzz-kit, canvas-probe, storage-probe, firefox-stand-in, webkit-driver and the house-rule hooks.
// Needs node and python3; the browser parts need Playwright for Python and CHROMIUM=/path/to/chrome (the tests refuse to fall back to Playwright's own Chromium). The Firefox step (tests/firefox.js) runs only if puppeteer-core and Firefox are found. Use --quick to skip browser parts.
//
// How it runs (all of this has an off switch; see "Run the tests" in AGENTS.md):
//   - Steps run side by side, slowest first, on min(cores, 4) lanes. Browser steps share ONE lane, so two browsers never run at once.
//       --serial (or KITS_JOBS=1)   one step at a time, in the order listed: the old behavior
//       --jobs N (or KITS_JOBS=N)   N lanes
//   - A step that fails while others ran beside it is run again once, alone. If it passes alone it is shown as "pass*" and its first output is
//     kept in a log file, so a flake stays visible. A step that fails alone is a real failure. KITS_RETRY=0 turns the second try off.
//   - --changed [BASE] runs only the steps whose files (or files they use) changed since BASE (default origin/main), plus the cheap always-run
//     steps. A changed file no step knows about runs everything. --all turns it off and runs everything.
//   - --only REGEX (or KITS_ONLY) runs only steps whose name matches.   --list prints the steps and what each watches, then stops.
//   - Every run ends with the total time, the time the steps would take one after another, and the five slowest steps.
var cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
var root = path.resolve(__dirname, '..');
var argv = process.argv.slice(2);
function flag(n) { return argv.indexOf(n) >= 0; }
function value(n) { var i = argv.indexOf(n); return i >= 0 && argv[i + 1] && argv[i + 1][0] !== '-' ? argv[i + 1] : null; }
var quick = flag('--quick');
var serial = flag('--serial') || process.env.KITS_JOBS === '1';
var jobs = serial ? 1 : Math.max(1, Math.min(4, parseInt(value('--jobs') || process.env.KITS_JOBS || '', 10) || os.cpus().length));
var onlyRe = value('--only') || process.env.KITS_ONLY;
var retry = process.env.KITS_RETRY !== '0';
var steps = [
  ['frame-kit', 'node', ['modules/frame-kit/test/run.js']],
  ['frame-kit lean', 'node', ['modules/frame-kit/test/lean.js']],
  ['sprite-baker', 'node', ['modules/sprite-baker/test/run.js']],
  ['sprite-baker lean', 'node', ['modules/sprite-baker/test/lean.js']],
  ['lzma-decode', 'node', ['modules/lzma-decode/test/run.js']],
  ['ppmd-decode', 'node', ['modules/ppmd-decode/test/run.js']],
  ['fuzz-kit engine', 'node', ['tools/fuzz-kit/test/run.js']],
  ['canvas-probe', 'node', ['tools/canvas-probe/test/run.js']],
  ['webkit-driver', 'node', ['tools/webkit-driver/test/run.js']],
  ['wake-keeper', 'node', ['modules/wake-keeper/test/run.js']],
  ['wake-keeper lean', 'node', ['modules/wake-keeper/test/lean.js']],
  ['stage-curtains', 'node', ['modules/stage-curtains/test/run.js']],
  ['fly-to-mini', 'node', ['modules/fly-to-mini/test/run.js']],
  ['sticker-text', 'node', ['modules/sticker-text/test/run.js']],
  ['cartoon-3d-kit', 'node', ['modules/cartoon-3d-kit/test/run.js']],
  ['env-probes', 'node', ['modules/env-probes/test/run.js']],
  ['fx-governor', 'node', ['modules/fx-governor/test/run.js']],
  ['hold-press', 'node', ['modules/hold-press/test/run.js']],
  ['back-close node', 'node', ['modules/back-close/test/run.js']],
  ['back-close lean', 'node', ['modules/back-close/test/lean.js']],
  ['slow-note', 'node', ['modules/slow-note/test/run.js']],
  ['spotlight-tour', 'node', ['modules/spotlight-tour/test/run.js']],
  ['test-isolation', 'node', ['tools/test-isolation/test/run.js']],
  ['speed-guard', 'python3', ['tools/speed-guard/test/run.py']],
  ['test-runner', 'node', ['tools/test-runner/test/run.js']],
  ['speed-lab', 'node', ['tools/speed-lab/test/run.js']],
  ['gif-writer', 'node', ['modules/gif-writer/test/run.js']],
  ['clip-writer', 'node', ['modules/clip-writer/test/run.js']],
  ['gif-writer filters', 'node', ['modules/gif-writer/test/fx.js']],
  ['gif-writer filters, WebAssembly twin', 'node', ['modules/gif-writer/test/fx-wasm.js']],
  ['zip-open', 'node', ['modules/zip-open/test/run.js']],
  ['memory-compression core', 'node', ['modules/memory-compression/test/core.js']],
  ['memory-compression core no wasm', 'node', ['modules/memory-compression/test/core.js', '--js-only']],
  ['memory-compression objects', 'node', ['modules/memory-compression/test/run.js']],
  ['memory-compression objects no wasm', 'node', ['modules/memory-compression/test/run.js', '--js-only']],
  ['memory-compression router', 'node', ['modules/memory-compression/test/router.js']],
  ['pcodec-js', 'node', ['--expose-gc', 'modules/pcodec-js/test/run.js']],
  ['pcodec-js SIMD reader', 'node', ['--expose-gc', 'modules/pcodec-js/test/run.js', '--reader', 'pcodec-js-fast.js']],
  ['netflow-sankey', 'node', ['modules/netflow-sankey/test/run.js']],
  ['netflow-engine', 'node', ['modules/netflow-engine/test/run.js']],
  ['netflow-layers', 'node', ['modules/netflow-layers/test/run.js']],
  ['netflow-scene', 'node', ['modules/netflow-scene/test/run.js']],
  ['walker-sim', 'node', ['modules/walker-sim/test/run.js']],
  ['walker-sim minified', 'node', ['modules/walker-sim/test/run.js', 'modules/walker-sim/walker-sim.min.js']],
  ['walker-sim default (with WebAssembly)', 'node', ['modules/walker-sim/test/run.js', 'modules/walker-sim/walker-sim-with-wasm.js']],
  ['walker-sim default minified', 'node', ['modules/walker-sim/test/run.js', 'modules/walker-sim/walker-sim-with-wasm.min.js']],
  ['pad-nav node', 'node', ['modules/pad-nav/test/run.js']],
  ['save-kit', 'node', ['modules/save-kit/test/run.js']],
  ['save-kit lean', 'node', ['modules/save-kit/test/lean.js']],
  ['tab-guard node', 'node', ['modules/tab-guard/test/run.js']],
  ['image-decode', 'node', ['modules/image-decode/test/run.js']],
  ['gpu-blur', 'node', ['modules/gpu-blur/test/run.js']],
  ['gpu-blur mutants', 'node', ['modules/gpu-blur/test/mutants.js']],
  ['field-report', 'node', ['modules/field-report/test/run.js']],
  ['idle-core', 'node', ['modules/idle-core/test/run.js']],
  ['idle-core minified', 'node', ['modules/idle-core/test/run.js', 'modules/idle-core/idle-core.min.js']],
  ['lzma-pack python', 'python3', ['tools/lzma-pack/test/run.py']],
  ['ppmd-pack python', 'python3', ['tools/ppmd-pack/test/run.py']],
  ['single-file-tools', 'python3', ['tools/single-file-tools/test/run.py']],
  ['fuzz-kit runner (fake page)', 'python3', ['tools/fuzz-kit/test/runner_fakes.py']],
  ['versions', 'python3', ['tools/versions/test/run.py']],
  ['version labels agree', 'python3', ['tools/versions/versions.py', 'check'], false, false, true],   // sixth item: always runs, even with --changed (it takes a fraction of a second)
  ['house-rule hooks', 'sh', ['tools/hooks/test.sh']],
  ['tab-guard', 'python3', ['modules/tab-guard/test/run.py'], true, true],
  ['back-close', 'python3', ['modules/back-close/test/run.py'], true, true],
  ['pad-nav', 'python3', ['modules/pad-nav/test/run.py'], true, true],
  ['frame-kit demo', 'python3', ['modules/frame-kit/test/check-example.py'], true, true],
  ['lzma-pack', 'python3', ['tools/lzma-pack/test/browser.py'], true, true],
  ['ppmd-pack', 'python3', ['tools/ppmd-pack/test/browser.py'], true, true],
  ['fuzz-kit browser', 'python3', ['tools/fuzz-kit/test/browser.py'], true, true],
  ['canvas-probe browser', 'python3', ['tools/canvas-probe/test/browser.py'], true, true],
  ['storage-probe browser', 'python3', ['tools/storage-probe/test/run.py'], true, true],
  ['webkit-driver webkit', 'node', ['tools/webkit-driver/test/webkit.js'], true, true],
  ['fuzz-kit webkit strict policy', 'node', ['tools/fuzz-kit/test/webkit-csp.js'], true, true],   // optional: the real WebKitGTK check skips itself (exit 0 with a note) when WebKitWebDriver is missing
  ['firefox-stand-in', 'python3', ['tools/firefox-stand-in/test/run.py'], true, true],   // optional: skipped (exit code 2) when Selenium, Firefox or geckodriver is missing
  ['flow demos', 'node', ['tests/flow-demos.js'], true, true],   // optional like the next one (needs puppeteer-core and CHROMIUM or FIREFOX)
  ['apple press pieces', 'node', ['tests/pieces-browser.js'], true, true],   // optional like the one above (slow-note, grown-ups-door, spotlight-tour, speed-lab, test-isolation in a real browser)
  ['idle-core same answers', 'node', ['tests/idle-core-browser.js'], true, true],   // optional like the ones above (one fixed set of calls in Node and in each browser)
  ['walker-sim same answers', 'node', ['tests/walker-sim-browser.js'], true, true],   // optional like the one above (walks, exact odds, sweeps and split runs in Node and in each browser, with timings)
  ['gif-writer same bytes', 'node', ['tests/gif-writer-browser.js'], true, true],   // optional like the one above (fixed scenes through the palette search and the encoder in Node and in each browser, with timings)
  ['gif-writer filters in browsers', 'node', ['tests/gif-writer-fx-browser.js'], true, true],   // optional like the one above (the WebAssembly filters against the JavaScript, the worker and the size tolerance in each browser)
  ['clip-writer in browsers', 'node', ['tests/clip-writer-browser.js'], true, true],   // optional like the one above (a real encode in each browser, then the file is opened in a video element)
  ['zip-open checksums', 'node', ['tests/zip-open-crc-browser.js'], true, true],   // optional like the one above (the checksum against a plain bit-by-bit CRC in Node and in each browser, with timings)
  ['sprite-baker Fancy pixels', 'node', ['tests/sprite-baker-fancy-browser.js'], true, true],   // optional like the one above (Fancy Banana's own filler against sprite-baker, byte for byte, in Node and in each browser, with timings)
  ['save-kit speed', 'node', ['tests/save-kit-speed-browser.js'], true, true],   // optional like the one above (one game-sized save and load, new file against an older one with OLD=, in Node and in each browser)
  ['memory-compression browser', 'node', ['tests/memory-compression-browser.js'], true, true],   // optional: the module's own 36 checks inside each browser page (about 6 to 8 s per browser)
  ['memory-compression pager browser', 'node', ['tests/memory-compression-pager-browser.js'], true, true],   // optional: pager() exactness (pages, background, real IndexedDB spill) and page-open timings in each browser
  ['gpu-blur browser', 'node', ['tests/gpu-blur-browser.js'], true, true],   // optional: every route (card, wasm, JavaScript) against the JavaScript reference, source and result kinds, the four fallbacks and the longest page task, in each browser (FIREFOX_GL=1 under xvfb-run for the card route in Firefox)
  ['image-decode browser', 'node', ['tests/image-decode-browser.js'], true, true],   // optional: the same pictures by every way in each browser (add IMG_DIR=<folder made by modules/image-decode/test/make-sheets.py> for the timings)
  ['image-decode ahead browser', 'node', ['tests/image-decode-ahead-browser.js'], true, true],   // optional: ahead() against load-when-asked at a stage change in each browser (needs IMG_DIR as above)
  ['pcodec-js browser', 'node', ['tests/pcodec-js-browser.js'], true, true],   // optional: the test page and the demo page in a real browser
  ['pcodec-js split browser', 'node', ['tests/pcodec-js-split-browser.js'], true, true],   // optional: {into}, pool warm and split files open equal on the pool, with open times for 0.5, 2 and 8 million numbers
  ['small lean browser', 'node', ['tests/small-lean-browser.js'], true, true],   // optional: back-close, wake-keeper, even-dt and quality-governor lean builds in each browser (about 3 s per browser)
  ['field-report browser', 'node', ['tests/field-report-browser.js'], true, true],
  ['frame-kit browser', 'node', ['tests/frame-kit-browser.js'], true, true],   // optional like the one above (the 67 checks of modules/frame-kit/test/run.js run inside each browser, plus about 1.5 s of real animation frames)
  ['firefox', 'node', ['tests/firefox.js'], true, true]      // fourth item: a browser step (left out by --quick, run one at a time); fifth: counts as skipped, not failed, when it exits with code 2
].map(function (s) { return { name: s[0], cmd: s[1], args: s[2], browser: !!s[3], skippable: !!s[4], always: !!s[5] }; });

// ---- what each step watches (for --changed): its own folder, every module or tool folder its files mention, and the shared test helpers ----
var known = [];
['modules', 'tools'].forEach(function (d) {
  try { fs.readdirSync(path.join(root, d)).forEach(function (n) { if (fs.statSync(path.join(root, d, n)).isDirectory()) known.push(d + '/' + n + '/'); }); } catch (e) { /* none */ }
});
function readAll(p) {   // the text of a file, or of every file in a folder (not deeper than test/)
  var out = '';
  try {
    var st = fs.statSync(path.join(root, p));
    if (st.isFile()) return fs.readFileSync(path.join(root, p), 'utf8');
    fs.readdirSync(path.join(root, p)).forEach(function (n) { var q = p + '/' + n; if (fs.statSync(path.join(root, q)).isFile() && /\.(js|mjs|py|sh|html)$/.test(n)) out += '\n' + fs.readFileSync(path.join(root, q), 'utf8'); });
  } catch (e) { /* unreadable: no extra watches */ }
  return out;
}
steps.forEach(function (s) {
  var script = s.args[0], m = /^((?:modules|tools)\/[^/]+)\//.exec(script), w = {}, text = '';
  if (m) { w[m[1] + '/'] = 1; text = readAll(m[1] + '/test'); }
  else { w[script] = 1; text = readAll(script); }
  known.forEach(function (d) {
    var n = d.split('/')[1];
    if (new RegExp('[/\'"`]' + n.replace(/[-]/g, '\\-') + '[/\'"`]').test(text)) w[d] = 1;
  });
  if (/webkit-shim/.test(text)) { w['tests/webkit-shim.js'] = 1; w['tools/webkit-driver/'] = 1; }
  s.watch = Object.keys(w);
});

function git(a) { var r = cp.spawnSync('git', a, { cwd: root, encoding: 'utf8' }); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ' failed'); return r.stdout.split('\n').filter(Boolean); }
function changedFiles(base) {
  try {
    if (!base) { try { git(['rev-parse', '--verify', 'origin/main']); base = 'origin/main'; } catch (e) { base = 'HEAD'; } }
    var seen = {};
    [['diff', '--name-only', base + '...HEAD'], ['diff', '--name-only'], ['diff', '--name-only', '--cached'], ['ls-files', '-o', '--exclude-standard']].forEach(function (a) { git(a).forEach(function (f) { seen[f] = 1; }); });
    return { base: base, files: Object.keys(seen) };
  } catch (e) { return null; }
}
var docsOnly = /\.md$|^(modules\.json|index\.html|llms\.txt|package\.json|TASKS\.md|\.gitignore|LICENSE)$|\/(demo|page)\.html$/;
function hits(s, f) { return s.watch.some(function (w) { return w.slice(-1) === '/' ? f.indexOf(w) === 0 : f === w; }); }

if (flag('--list')) {
  steps.forEach(function (s) { console.log((s.browser ? 'browser ' : '        ') + s.name + (s.always ? '  [always]' : '') + '\n          watches: ' + s.watch.join(' ')); });
  process.exit(0);
}

var plan = steps.filter(function (s) { return !(quick && s.browser) && (!onlyRe || new RegExp(onlyRe).test(s.name)); });
if (flag('--changed') && !flag('--all')) {
  var ch = changedFiles(value('--changed')), why = '';
  if (!ch) why = 'could not read git, running everything';
  else {
    var unknown = ch.files.filter(function (f) { return !steps.some(function (s) { return hits(s, f); }) && !docsOnly.test(f); });
    if (unknown.length) why = 'no step watches ' + unknown.slice(0, 3).join(', ') + (unknown.length > 3 ? ' and ' + (unknown.length - 3) + ' more' : '') + ', running everything';
    else {
      var before = plan.length;
      plan = plan.filter(function (s) { return s.always || ch.files.some(function (f) { return hits(s, f); }); });
      console.log('changed since ' + ch.base + ': ' + ch.files.length + ' file(s); running ' + plan.length + ' of ' + before + ' steps (--all runs everything)');
    }
  }
  if (why) console.log('--changed: ' + why);
}

// ---- timing memory: the last time each step took, so the slowest start first ----
var timesFile = path.join(__dirname, '.kits-times.json'), lastTimes = {};
try { lastTimes = JSON.parse(fs.readFileSync(timesFile, 'utf8')); } catch (e) { /* first run */ }
var weights = { 'single-file-tools': 25, 'tab-guard': 20, 'back-close': 20, 'pad-nav': 20, 'fuzz-kit browser': 15, 'ppmd-pack python': 15, 'lzma-pack python': 15 };   // rough seconds until a run has recorded real ones
function weight(s) { return lastTimes[s.name] != null ? lastTimes[s.name] : (weights[s.name] || 1); }

var logDir = path.join(os.tmpdir(), 'js-modules-kits-logs');
function exec(s) {
  return new Promise(function (resolve) {
    var t0 = Date.now(), out = '', p = cp.spawn(s.cmd, s.args, { cwd: root });
    p.stdout.on('data', function (d) { out += d; });
    p.stderr.on('data', function (d) { out += d; });
    p.on('error', function (e) { resolve({ s: s, code: 1, out: out + String(e), sec: (Date.now() - t0) / 1000 }); });
    p.on('close', function (code) { resolve({ s: s, code: code, out: out, sec: (Date.now() - t0) / 1000 }); });
  });
}
function secs(x) { return x.toFixed(1) + ' s'; }

async function main() {
  var T0 = Date.now(), results = [], failed = [], flaky = [], sum = 0;
  var ordered = serial ? plan.slice() : plan.slice().sort(function (a, b) { return weight(b) - weight(a); });
  function report(r, tag) {
    sum += r.sec;
    if (r.s.skippable && r.code === 2) {
      var note = (r.out.split('\n').filter(function (l) { return /skipped/.test(l); })[0]) || 'an optional tool is missing; see that step\'s README or tests/firefox.js';
      console.log('skip  ' + r.s.name + ' (' + note + ')'); return;
    }
    console.log((r.code === 0 ? (tag || 'ok   ') : 'FAIL ').padEnd(5) + ' ' + r.s.name + '  (' + secs(r.sec) + ')');
  }
  async function lane(queue) {
    while (queue.length) {
      var r = await exec(queue.shift());
      results.push(r);
      if (r.code !== 0 && !(r.s.skippable && r.code === 2)) failed.push(r);
      else report(r);
    }
  }
  var browserQ = ordered.filter(function (s) { return s.browser; }), plainQ = ordered.filter(function (s) { return !s.browser; });
  if (jobs === 1) { var all = ordered.slice(); await lane(all); }
  else {
    var plainLanes = Math.max(1, jobs - (browserQ.length ? 1 : 0)), lanes = [];
    for (var i = 0; i < plainLanes; i++) lanes.push(lane(plainQ));
    if (browserQ.length) lanes.push(lane(browserQ));   // one lane for browser steps: never two browsers at once
    await Promise.all(lanes);
  }
  // steps that failed: if others ran beside them, try once more alone
  var hard = [];
  for (var k = 0; k < failed.length; k++) {
    var f = failed[k];
    if (jobs > 1 && retry) {
      try { fs.mkdirSync(logDir, { recursive: true }); fs.writeFileSync(path.join(logDir, f.s.name.replace(/[^a-z0-9]+/gi, '-') + '.log'), f.out); } catch (e) { /* log is a bonus */ }
      var again = await exec(f.s);
      if (again.code === 0) { flaky.push(f.s.name); report(again, 'pass*'); continue; }
      f = again;
    }
    report(f); hard.push(f);
  }
  var wall = (Date.now() - T0) / 1000;
  hard.forEach(function (r) { console.log('\n--- ' + r.s.name + ' ---\n' + (r.out.trim().split('\n').slice(-40).join('\n'))); });
  var slow = results.slice().sort(function (a, b) { return b.sec - a.sec; }).slice(0, 5).map(function (r) { return r.s.name + ' ' + secs(r.sec); }).join(', ');
  console.log('\n' + results.length + ' step(s) in ' + secs(wall) + ' on ' + jobs + ' lane(s); one after another they take about ' + secs(sum) + '. Slowest: ' + slow);
  if (flaky.length) console.log('failed once beside other steps and passed alone (first output kept in ' + logDir + '): ' + flaky.join(', '));
  var next = lastTimes; results.forEach(function (r) { next[r.s.name] = Math.round(r.sec * 10) / 10; });   // remembered for the next run's ordering (kept out of git)
  try { fs.writeFileSync(timesFile, JSON.stringify(next, null, 1)); } catch (e) { /* read-only checkout */ }
  console.log(hard.length ? hard.length + ' step(s) failed' : 'all steps passed');
  process.exit(hard.length ? 1 : 0);
}
main();
