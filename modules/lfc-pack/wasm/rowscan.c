/* Copyright (c) 2026 LFC Foundry. MIT License.
   rowscan.wasm: packTables and packRows row text. b holds the UTF-8 text of JSON.stringify(rows) (an array: b[0] '[', b[n-1] ']').
   Commas between the array's own items (outside strings, at the array's own depth) become line ends, and so does the closing bracket,
   so the bytes after '[' are the rows stringified one by one and joined with line ends, with a line end at the end.
   One call walks the whole text: 256 KB calls (state carried between calls) measured the same in the three test browsers.
   The module imports the tokenizer's memory, so it holds none of its own. */
typedef unsigned char u8; typedef unsigned int u32;
__attribute__((export_name("scan"))) void scan(u8* b, u32 n){
  u32 i, e = n - 1; int d = 0; u8 c;
  for (i = 1; i < e; i++) { c = b[i];
    if (c == 34) { for (i++; (c = b[i]) != 34; i++) if (c == 92) i++; }
    else if (c == 123 || c == 91) d++;
    else if (c == 125 || c == 93) d--;
    else if (c == 44 && d == 0) b[i] = 10; }
  b[e] = 10;
}
