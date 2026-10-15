// optsvg.js, part of JS-modules (https://github.com/JNFoo/JS-modules). Copyright (c) 2026 LFC Foundry, MIT License.
// Usage: npm i svgo; node optsvg.js in.html out.html
// Compresses the inline SVG pictures that are written directly in the page (not the ones the script builds).
// Careful settings: nothing is merged, moved, renamed or removed that a style rule or the script could point at;
// only comments, number precision, path notation, colors and empty attributes are tightened.
const fs = require('fs');
const { optimize } = require('svgo');
const [src, dst, report] = process.argv.slice(2);
let html = fs.readFileSync(src, 'utf8');
let cut = 0, best = 0; for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) if (m[1].length > best) { best = m[1].length; cut = m.index; }
let head = html.slice(0, cut), rest = html.slice(cut);
const PREC = 2;
const config = { multipass: false, js2svg: { pretty: false }, plugins: [
  'removeDoctype', 'removeXMLProcInst', 'removeComments', 'removeMetadata', 'removeEditorsNSData',
  { name: 'cleanupNumericValues', params: { floatPrecision: PREC } },
  { name: 'convertPathData', params: { floatPrecision: PREC, transformPrecision: 4 } },
  'convertColors', 'removeEmptyAttrs', 'removeEmptyText',
] };
let before = 0, after = 0, n = 0, skipped = 0;
head = head.replace(/<svg\b[\s\S]*?<\/svg>/g, blk => {
  before += blk.length;
  let t = blk.replace(/^(<svg\b[^>]*?)\s(hidden|inert)(?=[\s>])/, '$1 $2=""');
  try {
    const out = optimize(t, config).data;
    if (!/^<svg/.test(out) || !/<\/svg>$/.test(out)) throw new Error('shape');
    after += out.length; n++; return out;
  } catch (e) { skipped++; after += blk.length; return blk; }
});
fs.writeFileSync(dst, head + rest);
console.log('svg: ' + n + ' pictures, ' + skipped + ' left alone; ' + before + ' -> ' + after + ' bytes (before whitespace squeeze)');
