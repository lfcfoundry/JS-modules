#!/usr/bin/env node
// Builds netflow-plot-line.min.js: netflow-scene.js and netflow-plot.js in one small file that draws line charts only. Copyright (c) 2026 LFC Foundry. MIT License.
// How: the two files are joined, every line chart in line-uses.js is drawn once while the engine counts which functions run, each function that
// never ran is emptied (it throws a plain error if a chart ever needs it), and terser shrinks the rest.
// Run: TERSER=/path/to/terser node modules/netflow-plot/test/make-line.js   (or have terser on the PATH). Add --check to only say whether the shipped file is current.
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os'), crypto = require('crypto'), inspector = require('inspector');
var dir = path.join(__dirname, '..'), plotFile = path.join(dir, 'netflow-plot.js'), sceneFile = path.join(dir, '..', 'netflow-scene', 'netflow-scene.js'), out = path.join(dir, 'netflow-plot-line.min.js');
var plot = fs.readFileSync(plotFile, 'utf8'), scene = fs.readFileSync(sceneFile, 'utf8'), uses = fs.readFileSync(path.join(__dirname, 'line-uses.js'), 'utf8'), self = fs.readFileSync(__filename, 'utf8');
var ver = /Version (\d+\.\d+\.\d+) \(API (\d+)\)/.exec(plot), sver = /Version (\d+\.\d+\.\d+)/.exec(scene)[1];
var stamp = crypto.createHash('sha1').update(plot).update(uses).update(self).digest('hex').slice(0, 12);   /* netflow-plot.js, the chart list and this script; run.js checks it. A newer netflow-scene.js alone does not make the file stale: run.js checks the pictures still match */
function one(text, a, b) { var i = text.indexOf(a); if (i < 0 || text.indexOf(a, i + 1) >= 0) throw new Error('make-line: expected exactly one "' + a.slice(0, 50) + '"'); return text.replace(a, b); }
/* the joined source: the scene inside its own function (its loader sees a local module), then the plot, which is handed that scene */
var p2 = one(plot, "if (typeof module !== 'undefined' && module.exports) module.exports = NetflowPlot;", '');
p2 = one(p2, 'function sceneLib(who) {', 'function sceneLib(who) { if (NFL_SCENE) return NFL_SCENE;');
var joined = 'var NetflowLine = (function () {\n"use strict";\nfunction NFL_GONE() { throw new Error("netflow-plot-line: this small file draws line charts only; for this chart or option use netflow-plot.js with netflow-scene.js"); }\n' +
  'var NFL_SCENE = (function () { var module = { exports: {} }, define;\n' + scene + '\nreturn module.exports; })();\n' + p2 +
  '\nreturn { version: "' + ver[1] + '", toSvg: function (data, o) { var q = {}, k; for (k in o) q[k] = o[k]; q.type = "line"; return NetflowPlot.toSvg(data, q); } };\n})();\nif (typeof module !== "undefined" && module.exports) module.exports = NetflowLine;\n';
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nfl-')), full = path.join(tmp, 'joined.js'), cut = path.join(tmp, 'cut.js');
fs.writeFileSync(full, joined);
/* count which functions run */
var ses = new inspector.Session(); ses.connect();
ses.post('Profiler.enable'); ses.post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
var L = require(full), n = 0;
require('./line-uses.js').each(function (d, o) { L.toSvg(d, o); n++; });
var cov; ses.post('Profiler.takePreciseCoverage', function (e, r) { cov = r; }); ses.disconnect();
var entry = cov.result.filter(function (s) { return s.url.indexOf('joined.js') >= 0; })[0], dead = [];
entry.functions.forEach(function (f) {
  f.ranges.forEach(function (r, i) {
    if (r.count !== 0) return;
    var t = joined.slice(r.startOffset, r.endOffset), m;
    if (i === 0) { m = /^function\b[^(]*\([^)]*\)\s*\{/.exec(t); if (m && t[t.length - 1] === '}' && !/^function NFL_GONE/.test(t)) dead.push([r.startOffset, r.endOffset, m[0] + ' NFL_GONE(); }']); }   /* a function that never ran */
    else if (t[0] === '{' && t[t.length - 1] === '}' && t.length > 40) dead.push([r.startOffset, r.endOffset, '{ NFL_GONE(); }']);                                              /* a { block } that never ran inside one that did */
  });
});
dead.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
var text = '', pos = 0, gone = 0;
dead.forEach(function (d) { if (d[0] < pos) return; text += joined.slice(pos, d[0]) + d[2]; pos = d[1]; gone++; });   /* the outermost of nested ones */
text += joined.slice(pos); fs.writeFileSync(cut, text);
/* the cut file must draw every one of those charts exactly as the whole one does */
var C = require(cut), bad = 0, firstBad = '';
require('./line-uses.js').each(function (d, o) { var a = L.toSvg(d, o), b; try { b = C.toSvg(d, o); } catch (e) { b = 'error: ' + e.message; } if (a !== b) { bad++; if (!firstBad) firstBad = JSON.stringify(o).slice(0, 200) + ' ' + b.slice(0, 160); } });
if (bad) { console.error('make-line: ' + bad + ' charts differ after the cut. First: ' + firstBad); process.exit(1); }
var head = '/*! netflow-plot-line.min.js: line charts only, minified from netflow-plot.js and netflow-scene.js ' + sver + '. Version ' + ver[1] + ' (API ' + ver[2] + '), build ' + stamp + '. Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules */\n';
if (process.argv.indexOf('--check') >= 0) { var cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''; var okNow = cur.indexOf('build ' + stamp + '.') >= 0; console.log(okNow ? 'netflow-plot-line.min.js is current' : 'netflow-plot-line.min.js is stale: run test/make-line.js'); process.exit(okNow ? 0 : 1); }
var body = cp.execFileSync(process.env.TERSER || 'terser', [cut, '--ecma', '2020', '-c', 'passes=3', '-m', '--comments', 'false'], { maxBuffer: 1 << 26 }).toString().trim();
var minTmp = path.join(tmp, 'min.js'); fs.writeFileSync(minTmp, head + body + '\n');
var M = require(minTmp), badM = 0; require('./line-uses.js').each(function (d, o) { var b; try { b = M.toSvg(d, o); } catch (e) { b = ''; } if (b !== L.toSvg(d, o)) badM++; });
if (badM) { console.error('make-line: ' + badM + ' charts differ in the minified file'); process.exit(1); }
fs.writeFileSync(out, head + body + '\n'); fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote ' + path.basename(out) + ' from ' + n + ' line charts: ' + gone + ' functions and blocks emptied, ' + Buffer.byteLength(head + body + '\n') + ' bytes, ' + require('zlib').gzipSync(head + body + '\n', { level: 9 }).length + ' gzipped');
