// optsvg.js, part of JS-modules (https://github.com/lfcfoundry/JS-modules). Copyright (c) 2026 LFC Foundry, MIT License.
// Usage: npm i svgo; node optsvg.js in.html out.html [--report]
// Compresses the inline SVG pictures that are written directly in the page's markup, anywhere in the file (also after the game's script).
// SVG text inside <script>, <style>, <textarea> and comments is left byte for byte as it is: a script that builds pictures from a string
// must not be rewritten. --report lists each picture with its size before and after and the gzip-9 size of the whole file before and after,
// because a picture that shrinks a lot as text can shrink only a little after compression. Pictures that cannot be read are always listed.
// Careful settings: nothing is merged, moved, renamed or removed that a style rule or the script could point at;
// only comments, number precision, path notation, colors and empty attributes are tightened.
const fs = require('fs');
let optimize;
try { ({ optimize } = require('svgo')); }
catch (e) { console.error('optsvg.js needs svgo: run  npm i svgo  (in this folder or any parent folder)'); process.exit(1); }
const args = process.argv.slice(2), report = args.includes('--report'), files = args.filter(a => a !== '--report');
const [src, dst] = files;
if (!src || !dst) { console.error('usage: node optsvg.js in.html out.html [--report]'); process.exit(1); }
const html = fs.readFileSync(src, 'utf8');
const PREC = 2;
const config = { multipass: false, js2svg: { pretty: false }, plugins: [
  'removeDoctype', 'removeXMLProcInst', 'removeComments', 'removeMetadata', 'removeEditorsNSData',
  { name: 'cleanupNumericValues', params: { floatPrecision: PREC } },
  { name: 'convertPathData', params: { floatPrecision: PREC, transformPrecision: 4 } },
  'convertColors', 'removeEmptyAttrs', 'removeEmptyText',
] };
let before = 0, after = 0, n = 0, skipped = 0;
const lines = [], notes = [];

// One <svg>...</svg> block starting at i, counting nested <svg> so an inner picture does not end the outer one. Returns the end index or -1.
function svgEnd(text, i) {
  const re = /<svg\b|<\/svg\s*>/gi; re.lastIndex = i; let depth = 0, m;
  while ((m = re.exec(text))) {
    if (m[0][1] === '/') { if (--depth === 0) return m.index + m[0].length; } else depth++;
  }
  return -1;
}
function leftAlone(blk, why) {
  skipped++; after += blk.length; before += blk.length;
  const line = '  left alone (' + why + '): ' + blk.slice(0, 40).replace(/\s+/g, ' ') + '...';
  lines.push(line); notes.push(line);
}
function optimizeBlock(blk) {
  if (/<script\b/i.test(blk)) { leftAlone(blk, 'it has a script inside'); return blk; }
  before += blk.length;
  const t = blk.replace(/^(<svg\b[^>]*?)\s(hidden|inert)(?=[\s>])/, '$1 $2=""');
  try {
    const res = optimize(t, config).data;
    if (!/^<svg/.test(res) || !/<\/svg>$/.test(res)) throw new Error('shape');
    after += res.length; n++; lines.push('  picture ' + n + ': ' + blk.length + ' -> ' + res.length + ' bytes'); return res;
  } catch (e) { before -= blk.length; leftAlone(blk, 'svgo could not read it'); return blk; }
}
// Everything between these tags is not markup and is passed through untouched. A picture is found by scanning the whole file once, so
// a picture with its own <style> (or a comment) inside is still one block, and a picture that cannot be read never hides the ones after it.
const SKIP = '<script\\b[^>]*>[\\s\\S]*?<\\/script\\s*>|<style\\b[^>]*>[\\s\\S]*?<\\/style\\s*>|<textarea\\b[^>]*>[\\s\\S]*?<\\/textarea\\s*>|<!--[\\s\\S]*?-->';
const scan = new RegExp(SKIP + '|<svg\\b', 'gi');
let result = '', pos = 0, m;
while ((m = scan.exec(html))) {
  if (m[0].toLowerCase() !== '<svg' ) { continue; }       // a script, style, textarea or comment outside any picture: leave as is
  const end = svgEnd(html, m.index);
  if (end < 0) { leftAlone(html.slice(m.index, m.index + 60), 'it is never closed'); scan.lastIndex = m.index + 4; continue; }
  result += html.slice(pos, m.index) + optimizeBlock(html.slice(m.index, end));
  pos = end; scan.lastIndex = end;
}
result += html.slice(pos);
fs.writeFileSync(dst, result);
console.log('svg: ' + n + ' pictures, ' + skipped + ' left alone; ' + before + ' -> ' + after + ' bytes (before whitespace squeeze)');
if (skipped) console.log(skipped + (skipped === 1 ? ' picture' : ' pictures') + ' could not be read, so ' + (skipped === 1 ? 'it was' : 'they were') + ' left as written:\n' + notes.join('\n'));
if (report) {
  const zlib = require('zlib'), gz = t => zlib.gzipSync(Buffer.from(t, 'utf8'), { level: 9 }).length;
  const g0 = gz(html), g1 = gz(result);
  if (lines.length) console.log(lines.filter(l => !notes.includes(l)).join('\n'));
  console.log('gzip at level 9: whole file ' + g0 + ' -> ' + g1 + ' bytes (' + (g0 === g1 ? 'no change' : (g1 < g0 ? 'saves ' : 'costs ') + Math.abs(g0 - g1)) + ' after compression)');
}
