/* Copyright (c) 2026 LFC Foundry. MIT License
   Plain Node, no browser, no dependencies. Run: node modules/cartoon-3d-kit/test/run.js   (exits 1 on any failure)
   1. Label-on-body contrast of every skin in the guide's table and in the demo's skin list must be at least 4.5:1.
   2. The guide and the demo must not contain the old game or product names.
   3. The demo keeps the accessibility pieces the guide teaches (checked as text). */
'use strict';
var fs = require('fs'), path = require('path');
var dir = path.resolve(__dirname, '..');
var guide = fs.readFileSync(path.join(dir, 'STYLE-GUIDE.md'), 'utf8');
var demo = fs.readFileSync(path.join(dir, 'demo.html'), 'utf8');
var MIN = 4.5, failed = 0, passed = 0;

function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) h = h.replace(/./g, '$&$&');
  var n = parseInt(h, 16);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : '')); }
}
function skin(where, name, mid, label) {
  var r = ratio(mid, label);
  check(where + ' ' + name + ': label ' + label + ' on ' + mid + ' is ' + r.toFixed(2) + ':1, ' + (r >= MIN ? 'readable' : 'too faint (needs ' + MIN + ':1), pick a darker or lighter label'), r >= MIN);
}

/* 1a. the guide's skin table: | Skin | hi | mid | lo | glow | label | */
var rows = guide.split('\n').filter(function (l) {
  return /^\|\s*[A-Za-z][^|]*\|(\s*#[0-9a-fA-F]{3,6}\s*\|){5}\s*$/.test(l);
});
check('guide skin table found (at least 8 skins)', rows.length >= 8, rows.length + ' rows');
rows.forEach(function (l) {
  var c = l.split('|').map(function (x) { return x.trim(); });   // ['', name, hi, mid, lo, glow, label, '']
  skin('guide table', c[1], c[3], c[6]);
});

/* 1b. the guide's CSS examples: [data-hue="N"] { ... --sk-mid ... --sk-label (default white) } */
var cssSkins = 0;
guide.split('\n').forEach(function (l) {
  var m = /\[data-hue="(\d+)"\]\s*\{([^}]*)\}\s*(?:\/\*\s*([^*]*?)\s*\*\/)?/.exec(l);
  if (!m) return;
  var mid = /--sk-mid:\s*(#[0-9a-fA-F]{3,6})/.exec(m[2]), lab = /--sk-label:\s*(#[0-9a-fA-F]{3,6})/.exec(m[2]);
  if (!mid) return;
  cssSkins++;
  skin('guide css', (m[3] || 'hue ' + m[1]).split(':')[0], mid[1], lab ? lab[1] : '#fff');
});
check('guide CSS skin examples found', cssSkins >= 6, cssSkins + ' found');

/* 2. the demo's skin list: var SK={name:[hi,mid,lo,glow,label],...} */
var sk = /var SK=\{([^;]*)\};/.exec(demo), count = 0, names = {};
if (sk) {
  var re = /(\w+):\[((?:'#[0-9a-fA-F]{3,6}',?\s*){5})\]/g, m;
  while ((m = re.exec(sk[1]))) {
    var v = m[2].match(/#[0-9a-fA-F]{3,6}/g);
    count++; names[m[1]] = 1;
    skin('demo', m[1], v[1], v[4]);
  }
}
check('demo skin list found, every skin has five colors', count >= 4, count + ' skins');
var buttons = (demo.match(/data-skin="(\w+)"/g) || []).map(function (s) { return /"(\w+)"/.exec(s)[1]; });
check('every skin button in the demo has a skin in the list', buttons.length > 0 && buttons.every(function (b) { return names[b]; }), buttons.join(','));

/* 3. names that must not appear */
['Apple Press', 'Character Press', 'apple-press'].forEach(function (t) {
  check('guide does not contain "' + t + '"', guide.indexOf(t) < 0);
  check('demo does not contain "' + t + '"', demo.indexOf(t) < 0);
});
check('guide does not contain "an character"', guide.indexOf('an character') < 0);

/* 4. accessibility pieces in the demo (text checks only; no browser is run) */
check('demo asks matchMedia for reduced motion', /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(demo));
check('demo has a forced-colors block', /@media \(forced-colors:active\)/.test(demo));
check('demo has the color-scheme meta tag', /<meta name="color-scheme" content="only light">/.test(demo));
check('demo uses the button center for keyboard clicks', /e\.detail===0/.test(demo));
check('demo footer credit is present', demo.indexOf('Forged by') > 0 && demo.indexOf('LFC Foundry') > 0 && demo.indexOf('MIT Licensed') > 0);

console.log(failed ? '\n' + failed + ' check(s) failed, ' + passed + ' passed' : '\nall ' + passed + ' checks passed');
process.exit(failed ? 1 : 0);
