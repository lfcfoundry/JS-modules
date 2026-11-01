# slow-note

**Version 1.0.0 · API 1**

**Tested in:** Node checks; tests/pieces-browser.js slow-note one browser at a time on 2026-10-17: ungoogled Chromium 155.0.8059.39-1 (errors, rejections, slow tap and slow frame seen), Firefox 158.0 and WebKitGTK 2.52.6 (errors, rejections and slow tap seen; kept across a reload). Not run: a phone, Safari itself.

## What it is and how it works

A short note, kept only on the player's device, of the slow and broken moments a page lived through. 3.7 KB gzipped. Nothing is sent anywhere.

- It listens to errors, rejected promises, slow taps and long frames the browser already measures.
- It keeps the last 30 lines in `localStorage`, at most one of each kind per second.
- `note.copy()` gives the player plain text to paste into a message.

## Why it exists

"It felt slow on my phone" cannot be fixed without a hint of where. The browser already measures slow taps and long frames; this keeps a few where the player can copy them, with no network and no privacy notice needed.

**Where it helps**

- Bug reports from players.
- Spotting slow taps on real phones.
- Apps that must never send data.

**Not for:** graphics-chip slowdowns the browser does not report.

## Try it and test it
**Test it:** `node modules/slow-note/test/run.js` (7 checks on the log, about 0.2 s) and `node tests/pieces-browser.js` (a real page in Firefox 158 and ungoogled Chromium 155). **Try it:** `demo.html`.

## Use
```js
var note = SlowNote.start({
  key: "mygame-log",                                   // where the last notes are kept (localStorage); leave it out to keep them in memory only
  header: "My Game 1.4",                               // first line of the report
  context: function () { return " [level " + level + "]"; },   // added to every note: what the game was doing
  marks: function () { return { "the game script began": t1, "the first frame came": t2 }; }   // milliseconds since load, for the start-up line
});
note.count();                                          // 3
note.text();                                           // the whole report as plain text
note.copy().then(function (ok) { say(ok ? "Copied! Paste it into a message." : "Select the note and copy it."); });
note.clear();
note.onChange(function (count) { label.textContent = count + " moments noted."; });
```
- **What is noted:** `error` (script errors and rejected promises), `slow tap` (a click, tap or key the browser measured at 104 ms or more, with how long it waited and how long your code ran) and `slow frame` (a frame of 100 ms or more, with how long it blocked). `note.supports` says which of the three this browser can see.
- **Quiet and light:** nothing is noted in the first 4 seconds after load (the busy start-up is not what this is for), one note of each kind per second at most, the last 30 are kept, and each note is cut at 220 characters before your `context`. No timer runs while the page is smooth; storage is written at most every 4 seconds and when the page is hidden or closed.
- **The report** starts with your header, the browser, the window size and the time, then a start-up line in plain words (page parsed, your marks, first paint, finished loading), then one line per moment.
- Options: `max`, `quietMs`, `perKindMs`, `saveMs`, `tapMs` (104), `frameMs` (100), `storage`. `SlowNote.createLog(opts)` is the log without any page (used by the tests), `SlowNote.startupWords(marks)` is the start-up line alone.
- A damaged or foreign value under your key is ignored, and a full or blocked storage never throws.

## Numbers
- One note costs about 1 microsecond (measured in Node 22, not in a test browser, 20,000 notes in a row), and nothing at all between events.
- **What each browser can see** (checked 2026-10-17 from `PerformanceObserver.supportedEntryTypes`): ungoogled Chromium 155: errors, slow taps and slow frames. Firefox 158: errors and slow taps; it has no Long Animation Frames, so there are no slow-frame notes there.

## How it compares
It does a different job from the usual tools: it keeps a short note on the player's device that the player can copy, and sends nothing. The closest named library measures page metrics for your analytics and does not catch errors or keep a note. Speed in browsers: not measured.

| Alternative | Size (smaller is better) | Speed (faster is better) | Features | Where it wins / loses |
| --- | --- | --- | --- | --- |
| **slow-note 1.0.0** (this module, MIT) | 9.7 KB readable (3.7 KB gzipped); 6,062 B minified (2,649 B gzipped, terser 5.36.0) | Speed in browsers: not measured (it only listens for events; nothing runs while the page is smooth) | Errors, rejected promises, slow taps, long frames; kept on the device; copy as plain text | Wins: player-copyable note, nothing leaves the device. Loses: no field metrics |
| [web-vitals](https://github.com/GoogleChrome/web-vitals) 6.2.3 (Apache-2.0) | Attribution build 15.7 KB (5.5 KB gzipped) | Not measured | Page-load and interaction metrics (CLS, FCP, INP, LCP, TTFB) handed to your callback | Wins: standard field metrics for your own analytics. Loses: no error catching, no local note |
| Error-reporting services (Sentry and similar) | Not measured | Not measured | Send errors to a server by design | Wins: reports from many players in one place. Loses: needs a server, a privacy notice and network use |
| A hand-written `window.onerror` handler | A few lines | Not measured | Only what you write | Wins: tiny. Loses: no slow taps or long frames, nothing kept between visits, no copy button unless you write one |

**Where it loses**
- It cannot see graphics-chip cost: a game can drop frames while the browser reports nothing slow.
- Slow-tap notes need a recent browser. Long frames are seen only in Chromium 155; Firefox 158 and WebKitGTK 2.52.6 do not have them.
- WebKitGTK 2.52.6 hides the text of errors on pages opened from `file://`.
- The note lives in `localStorage`: clearing site data clears it.
- A note says what happened, not why.
- Not measured: speed in browsers; sizes and speeds of the alternatives. Not run: a phone, Safari itself.

## Limits
- It cannot see graphics-chip cost: a game can drop frames while the browser reports nothing slow. The demo and `speed-lab` are for that.
- Event timing needs a recent browser (Chromium 155, Firefox 158 and WebKitGTK 2.52.6 have it; Safari itself was not checked). Without it, only errors are noted. Long frames are seen only in Chromium 155 (Firefox 158 and WebKitGTK 2.52.6 have no Long Animation Frames).
- **WebKit hides the text of errors on pages opened from `file://`.** The note still records that an error happened, but WebKitGTK 2.52.6 says only "Script error." with no file or line; from a web address (`http://`) it gives the full message and line (checked with the demo page).
- The note lives in `localStorage`: clearing site data clears it, and in a privacy window it is kept in memory only until the page closes.
- A note says what happened, not why. It adds the browser's own numbers and your `context`, nothing deeper.

## See it in action

Used right now in [Apple Press](https://lfcfoundry.github.io/apple-press/play/). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## Prior art and credits
- [web-vitals](https://github.com/GoogleChrome/web-vitals) (Apache-2.0, 6.2.3): read as prior art for measuring interaction and page-load metrics. Not used and nothing taken. Use it when you want field metrics in your own analytics.
- Error-reporting services (Sentry and similar): named for comparison only. Nothing taken.
- The browser's own PerformanceObserver, Event Timing and Long Animation Frames features supply the slow-tap and long-frame readings; they are web standards, not code from others.
- Cut from the slow-moment note in Apple Press, LFC Foundry's own game, so the code is the project's own.

No code from others; the ideas above are theirs.

## For AI agents
Start it once, early, with a `key` that names the game and a `context` that returns the game's state in a few words. Add a "Copy note" and a "Clear note" button where players find help, and say in the page that nothing leaves the device. Do not add a network call to it.
