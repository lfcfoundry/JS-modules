// optsvg.js, part of JS-modules (https://github.com/lfcfoundry/JS-modules). Copyright (c) 2026 LFC Foundry, MIT License.
// Usage: npm i svgo; node optsvg.js in.html out.html [--report]
// Compresses the inline SVG pictures that are written directly in the page's markup, anywhere in the file (also after the game's script).
// SVG text inside <script>, <style>, <textarea> and comments is left byte for byte as it is: a script that builds pictures from a string
// must not be rewritten. --report lists each picture with its size before and after.
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
const lines = [];

// One <svg>...</svg> block starting at i, counting nested <svg> so an inner picture does not end the outer one. Returns the end index or -1.
function svgEnd(text, i) {
  const re = /<svg\b|<\/svg\s*>/gi; re.lastIndex = i; let depth = 0, m;
  while ((m = re.exec(text))) {
    if (m[0][1] === '/') { if (--depth === 0) return m.index + m[0].length; } else depth++;
  }
  return -1;
}
function optimizeMarkup(seg) {            // seg holds no script, style, textarea or comment
  let out = '', pos = 0;
  const open = /<svg\b/gi; let m;
  while ((m = open.exec(seg))) {
    const end = svgEnd(seg, m.index);
    if (end < 0) break;
    const blk = seg.slice(m.index, end);
    out += seg.slice(pos, m.index); pos = end; open.lastIndex = end;
    before += blk.length;
    const t = blk.replace(/^(<svg\b[^>]*?)\s(hidden|inert)(?=[\s>])/, '$1 $2=""');
    try {
      const res = optimize(t, config).data;
      if (!/^<svg/.test(res) || !/<\/svg>$/.test(res)) throw new Error('shape');
      after += res.length; n++; lines.push('  picture ' + n + ': ' + blk.length + ' -> ' + res.length + ' bytes'); out += res;
    } catch (e) { skipped++; after += blk.length; lines.push('  left alone: ' + blk.slice(0, 40).replace(/\s+/g, ' ') + '...'); out += blk; }
  }
  return out + seg.slice(pos);
}
// Everything between these tags is not markup and is passed through untouched.
const keep = /<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<textarea\b[^>]*>[\s\S]*?<\/textarea\s*>|<!--[\s\S]*?-->/gi;
let result = '', last = 0, m;
while ((m = keep.exec(html))) {
  result += optimizeMarkup(html.slice(last, m.index)) + m[0];
  last = m.index + m[0].length;
}
result += optimizeMarkup(html.slice(last));
fs.writeFileSync(dst, result);
console.log('svg: ' + n + ' pictures, ' + skipped + ' left alone; ' + before + ' -> ' + after + ' bytes (before whitespace squeeze)');
if (report && lines.length) console.log(lines.join('\n'));
