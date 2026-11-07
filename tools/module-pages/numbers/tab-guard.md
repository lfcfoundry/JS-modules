**Against tab-election and broadcast-channel, cloud-browser runs.**

Compared: tab-guard against tab-election and broadcast-channel (ms, lower is faster, median of 5 pairs of tabs).

<!-- title: tab-guard is in charge about as fast as the other tab-election libraries (all three are one lock request) and is smaller -->
| way | Chromium 155 first copy in charge | Firefox 158 first copy in charge |
|---|---:|---:|
| tab-guard 1.1.1 | 4.5 | 4.0 |
| tab-election 4.6.2 | 5.8 | 5.0 |
| broadcast-channel 7.4.0 | 5.5 | 4.0 |

Cloud-browser runs (shared machine, not the laptop). Speed does not separate them: every one is a single lock request. When the first copy closes, the next copy takes over after 8 ms for tab-guard, 7 for tab-election and 3 for broadcast-channel in Chromium (6, 6 and 6 in Firefox), so broadcast-channel is faster at that in Chromium. tab-guard waits 700 ms before calling a refused start a twin, so a reloading page can take its own lock back. WebKitGTK was not measured (the test driver serves one page at a time). The tab-election and broadcast-channel libraries have more features (messaging, a fallback without Web Locks); leader-tab is smaller still (1.9 KB).
