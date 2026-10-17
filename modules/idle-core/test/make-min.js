#!/usr/bin/env node
// Builds idle-core.min.js from idle-core.js: the first five header lines, then the terser output. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: TERSER=/path/to/terser node modules/idle-core/test/make-min.js   (or have terser on the PATH). Then: node modules/idle-core/test/run.js modules/idle-core/idle-core.min.js
var fs = require('fs'), path = require('path'), cp = require('child_process');
var src = path.join(__dirname, '..', 'idle-core.js'), out = path.join(__dirname, '..', 'idle-core.min.js');
var head = fs.readFileSync(src, 'utf8').split('\n').slice(0, 5).join('\n').replace(/\n \*\s*$/, '') + '\n */\n';
var body = cp.execFileSync(process.env.TERSER || 'terser', [src, '--ecma', '5', '-c', '-m', '--comments', 'false']).toString();
fs.writeFileSync(out, head + body.trim() + '\n');
console.log('wrote ' + path.basename(out) + ': ' + Buffer.byteLength(head + body) + ' bytes');
