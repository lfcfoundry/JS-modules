'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// Builds bench/jso-bench.html: one self-contained page with the module, the data sets and the pure-JavaScript contenders.
var fs = require('fs'), path = require('path'), D = (process.env.JSO_DEPS || '/tmp/jso-deps/node_modules/');
function r(p) { return fs.readFileSync(p, 'utf8'); }
function esc(s) { return s.replace(/<\/script/gi, '<\\/script'); }
var parts = ['<!doctype html><meta charset="utf-8"><title>memory-compression-jso comparison</title><pre id="out">running...</pre>'];
function add(src) { parts.push('<script>' + esc(src) + '</script>'); }
add('(function(){var module={exports:{}},exports=module.exports;' + r(D + 'fflate/umd/index.js') + '\nwindow.fflate=(module.exports&&Object.keys(module.exports).length)?module.exports:window.fflate;})();');
add('(function(){var reg={};function mk(src){var m={exports:{}};new Function("module","exports","require",src)(m,m.exports,function(n){return reg[n];});return m.exports;}' +
  'reg["./util.js"]=mk(' + JSON.stringify(r(D + 'lz4js/util.js')) + ');reg["./xxh32.js"]=mk(' + JSON.stringify(r(D + 'lz4js/xxh32.js')) + ');window.lz4js=mk(' + JSON.stringify(r(D + 'lz4js/lz4.js')) + ');})();');
add(r(D + 'msgpackr/dist/index.min.js'));
add(r(D + 'cbor-x/dist/index.min.js'));
add(r(D + '@msgpack/msgpack/dist.umd/msgpack.min.js'));
add('(function(process){' + r(path.join(process.env.AVSC_BUNDLE || path.join(__dirname, 'vendor/avsc.js'))) + '\nwindow.AVSC=AVSC;})({env:{},browser:true,nextTick:function(f){setTimeout(f,0);}});');
if (process.env.JSO_OLD) add(r(process.env.JSO_OLD) + '\nwindow.MCJSO_OLD=window.MemoryCompressionJSO;');          // an older build to compare with
add(r(path.join(__dirname, '../memory-compression-jso.js')));
add(r(path.join(__dirname, '../test/data.js')));
add('window.makeContenders=(function(){var module={exports:{}};' + r(path.join(__dirname, 'contenders.js')) + '\nreturn module.exports;})();');
add(r(path.join(__dirname, 'page-main.js')));
fs.writeFileSync(path.join(__dirname, 'jso-bench.html'), parts.join('\n'));
console.log('jso-bench.html', fs.statSync(path.join(__dirname, 'jso-bench.html')).size, 'bytes');
