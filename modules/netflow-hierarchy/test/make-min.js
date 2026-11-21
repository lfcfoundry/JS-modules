#!/usr/bin/env node
// Builds netflow-hierarchy.min.js from netflow-hierarchy.js: a short header (copyright, version), then the terser output. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: TERSER=/path/to/terser node modules/netflow-hierarchy/test/make-min.js   (or have terser on the PATH). Then: NH_FILE=modules/netflow-hierarchy/netflow-hierarchy.min.js node modules/netflow-hierarchy/test/run.js
var fs = require('fs'), path = require('path'), cp = require('child_process');
var src = path.join(__dirname, '..', 'netflow-hierarchy.js'), out = path.join(__dirname, '..', 'netflow-hierarchy.min.js');
var text = fs.readFileSync(src, 'utf8'), ver = /Version (\d+\.\d+\.\d+ \(API \d+\))/.exec(text)[1];
var head = '/*! netflow-hierarchy.js, minified. Version ' + ver + '. Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules */\n';
var body = cp.execFileSync(process.env.TERSER || 'terser', [src, '--ecma', '2018', '-c', 'passes=2', '-m', '--comments', 'false']).toString();
fs.writeFileSync(out, head + body.trim() + '\n');
console.log('wrote ' + path.basename(out) + ': ' + Buffer.byteLength(head + body.trim() + '\n') + ' bytes, ' + require('zlib').gzipSync(head + body.trim() + '\n', { level: 9 }).length + ' gzipped');
