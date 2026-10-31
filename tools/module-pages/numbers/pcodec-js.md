**New in 1.6.2: repeated big unpacks reuse a ready array.** The code thread's cloud-browser runs (Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6 on a shared machine, not the laptop).

5,000,000 numbers unpacked again and again, every 150 ms. Time with 1.6.2 divided by time before, with its 90% range; lower is better.

| Browser | New / old | 90% range |
|---|---:|---:|
| Chromium 155 | 0.63 | 0.61 to 0.79 |
| Firefox 158 | 0.80 | 0.76 to 0.82 |
| WebKitGTK 2.52.6 | 0.87 | 0.71 to 0.99 |

After a big unpack the page prepares one spare array of the same size while idle, and the next unpack fills it instead of asking the system for fresh memory. The spare is dropped after 4 s unused (`idleMs`); `load({ spare: false })` turns it off. Smaller unpacks are unchanged.
