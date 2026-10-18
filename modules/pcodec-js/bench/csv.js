'use strict';
const fs = require('fs');
function parse(text) {   // small CSV reader (quoted fields, no embedded newlines needed here)
  const rows = []; for (const line of text.split(/\r?\n/)) { if (!line) continue; const f = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { f.push(cur); cur = ''; } else cur += c; } f.push(cur); rows.push(f); }
  return rows;
}
module.exports = function (file) { const rows = parse(fs.readFileSync('../data/' + file, 'utf8')), head = rows[0], body = rows.slice(1); return { head, cols: head.map((h, i) => body.map((r) => r[i])) }; };
