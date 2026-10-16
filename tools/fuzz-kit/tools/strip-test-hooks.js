#!/usr/bin/env node
/* strip-test-hooks: remove test-only code from a shipped file. Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules

   Everything between /*TEST_HOOK_START*\/ and /*TEST_HOOK_END*\/ (markers included) is deleted, so the page you test (the "full" build with a
   window.__app handle, extra getters, forced states) and the page you ship are made from one source file.

     node strip-test-hooks.js input.js output.js      or      var stripTestHooks = require('./strip-test-hooks.js'); var shipped = stripTestHooks(source);

   It refuses (throws) when a START has no END, an END has no START, or hooks are nested, because a silent half-strip would ship broken code.
   ORDER MATTERS: run it on the source BEFORE any minifier. A minifier removes ordinary comments, so the markers are gone, nothing is stripped, and the test code ships.
   The command line prints a warning when it finds no markers. After every build, run tools/check-shipped.js on the file you ship. */
'use strict';
function stripTestHooks(src, start, end) {
  start = start || '/*TEST_HOOK_START*/'; end = end || '/*TEST_HOOK_END*/';
  var out = '', pos = 0, a, b, depthCheck;
  while ((a = src.indexOf(start, pos)) >= 0) {
    b = src.indexOf(end, a + start.length);
    if (b < 0) throw new Error('TEST_HOOK_START at offset ' + a + ' has no END');
    depthCheck = src.indexOf(start, a + start.length);
    if (depthCheck >= 0 && depthCheck < b) throw new Error('nested TEST_HOOK_START at offset ' + depthCheck);
    out += src.slice(pos, a); pos = b + end.length;
  }
  out += src.slice(pos);
  if (out.indexOf(end) >= 0) throw new Error('TEST_HOOK_END without a START');
  return out;
}
module.exports = stripTestHooks;
if (require.main === module) {
  var fs = require('fs'), args = process.argv.slice(2);
  if (args.length !== 2) { console.error('usage: node strip-test-hooks.js input output'); process.exit(2); }
  var src = fs.readFileSync(args[0], 'utf8'), res = stripTestHooks(src);
  fs.writeFileSync(args[1], res);
  console.log(args[1] + ': removed ' + (src.length - res.length) + ' characters of test hooks');
  if (src.length === res.length) console.error('warning: no TEST_HOOK markers found in ' + args[0] + ' (was a minifier run first? it deletes the markers and the test code would ship)');
}
