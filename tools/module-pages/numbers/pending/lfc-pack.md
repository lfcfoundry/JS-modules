Publish when the decimal-number and coordinate-stride code is on main (it is on a code branch now). Add to the module page numbers.

**What is new: decimals take 40 to 85% less space, and part reads got fast.**

| File size of decimal data, flat rows (100,000 rows, bytes) | Before | Now | Change |
|---|---:|---:|---:|
| Sensor readings, 3 decimals | 257,878 | 106,089 | -59% |
| GPS latitude, 5 decimals | 185,942 | 68,141 | -63% |
| Price, 4 decimals | 310,402 | 161,698 | -48% |
| Random values, 3 decimals | 358,103 | 212,902 | -41% |

| File size of decimal data in nested rows (bytes) | Before | Now | Change |
|---|---:|---:|---:|
| Sensor rows with ids and lists (100,000 rows) | 504,211 | 106,246 | -79% |
| GeoJSON points (50,000) | 421,852 | 146,499 | -65% |
| Orders with 2-decimal prices (50,000) | 449,125 | 226,975 | -50% |
| Epoch milliseconds + random big ints (50,000) | 466,513 | 399,701 | -14% |

**Also on that branch:** an opt-in generated row builder (needs `unsafe-eval` in the page policy; WebKitGTK 628 ms down to 183 ms), checksums with an optional faster XXH64 check, and a one-file viewer. Measured and not built: trained dictionaries (files grew) and a shared string table (under 0.1% possible).
