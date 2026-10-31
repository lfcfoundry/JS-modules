**New in 2.2.3: number labels made in a fraction of the time.** `fmt` and `fmtFull` now reuse one number formatter each instead of setting one up on every call; the text is the same. 20,000 calls, cloud browsers (not the laptop), ms, lower is better:

| Browser | 2.2.2 | 2.2.3 | New / old |
|---|---:|---:|---:|
| Chromium 153 | 928 | 44 | 0.039 |
| Firefox 158 | 368 | 14 | 0.047 |
| WebKitGTK 2.52.6 | 1,193 | 23 | 0.023 |

Other parts of the engine have not been measured on this page yet.
