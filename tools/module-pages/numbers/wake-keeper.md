**Against NoSleep.js, size only.** wake-keeper's behavior on a phone (whether the screen really stays awake on Android Chrome) has not been tested, so there is no speed or behavior chart.

Compared: wake-keeper against NoSleep.js 0.12.0 (gzipped size in KB, smaller is better).

<!-- title: wake-keeper is 2.1 KB gzipped against 7.2 KB for NoSleep.js, which also carries a video fallback -->
| way | gzip KB |
|---|---:|
| NoSleep.js | 7.2 |
| wake-keeper | 2.1 |

NoSleep.js uses the Screen Wake Lock where present, else a hidden looping video (its file embeds the video data). wake-keeper uses Screen Wake Lock only, so it does nothing in browsers without it (its README says so). It releases on a hidden tab and after idle (default 60 s) and retries after a refusal with a back-off; that is from reading both APIs, not from a test.
