#!/usr/bin/env node
/* check-shipped: after-build check that test code did not ship. Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/JNFoo/JS-modules

   Looks in the file you ship for the test handle and the hook markers, and fails (exit 1) if any is there.

     node check-shipped.js dist/index.html                      checks the default words: __app, TEST_HOOK_START, TEST_HOOK_END
     node check-shipped.js dist/index.html --word __fuzzConfig  also checks your own words (repeat --word)
     var check = require('./check-shipped.js'); var found = check(sourceText, ['__app']);   // the list of words that were found ([] = clean)

   Why: if a minifier runs BEFORE strip-test-hooks.js, the markers (ordinary comments) are already gone, the stripper removes nothing, and the test handle ships.
   If your handle is not called __app, pass its name. It checks plain text, so a name that is built from pieces at run time (`'__' + 'app'`) is not seen. */
'use strict';
var DEFAULT_WORDS = ['__app', 'TEST_HOOK_START', 'TEST_HOOK_END'];
function checkShipped(text, words) {
  var list = (words && words.length ? words : []).concat(DEFAULT_WORDS), found = [], k;
  for (k = 0; k < list.length; k++) if (found.indexOf(list[k]) < 0 && String(text).indexOf(list[k]) >= 0) found.push(list[k]);
  return found;
}
module.exports = checkShipped;
if (require.main === module) {
  var fs = require('fs'), args = process.argv.slice(2), file = args[0], extra = [], k;
  for (k = 1; k < args.length; k++) if (args[k] === '--word' && args[k + 1]) extra.push(args[++k]);
  if (!file) { console.error('usage: node check-shipped.js FILE [--word NAME] (repeat --word for more)'); process.exit(2); }
  var text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { console.error('cannot read ' + file + ': ' + e.message); process.exit(2); }
  var found = checkShipped(text, extra);
  if (found.length) { console.error('test code shipped in ' + file + ': found ' + found.join(', ') + '. Run the stripper on the source BEFORE the minifier.'); process.exit(1); }
  console.log(file + ': clean (no ' + DEFAULT_WORDS.concat(extra).join(', ') + ')');
}
