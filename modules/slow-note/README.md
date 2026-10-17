# slow-note

**Version 1.0.0 · API 1**

**Tested in:** Node checks where the piece has any; Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time, in a real browser (`tests/pieces-browser.js`, 2026-10-17; WebKitGTK through WebDriver, page at least 447 px wide). Not run: GNOME Web (Epiphany) 46.5, a phone. In WebKitGTK an error on a page opened from `file://` is noted only as "Script error." (over http it has the full text), and long frames are not seen (no Long Animation Frames).

A short note, kept only on the player's device, of the slow and broken moments a page lived through: errors, rejected promises, taps the browser calls slow and long frames. The player can copy it as plain text and paste it into a message when "it felt slow". 9.7 KB (3.7 KB gzipped), no dependencies. Cut from Apple Press.

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
- One note costs about 1 microsecond (Node 22, 20,000 notes in a row), and nothing at all between events.
- **What each browser can see** (checked 2026-10-17 from `PerformanceObserver.supportedEntryTypes`): ungoogled Chromium 155: errors, slow taps and slow frames. Firefox 158: errors and slow taps; it has no Long Animation Frames, so there are no slow-frame notes there.

## Why
"It felt slow on my phone" cannot be fixed without a hint of where. The browser already measures slow taps and long frames; this keeps the last few where the player can copy them, and sends nothing to anyone. That also means no privacy notice and no network use.

## Limits
- It cannot see graphics-chip cost: a game can drop frames while the browser reports nothing slow. The demo and `speed-lab` are for that.
- Event timing needs a recent browser (Chromium 155, Firefox 158 and WebKitGTK 2.52.6 have it; Safari itself was not checked). Without it, only errors are noted. Long frames are seen only in Chromium 155 (Firefox 158 and WebKitGTK 2.52.6 have no Long Animation Frames).
- **WebKit hides the text of errors on pages opened from `file://`.** The note still records that an error happened, but WebKitGTK 2.52.6 says only "Script error." with no file or line; from a web address (`http://`) it gives the full message and line (checked with the demo page).
- The note lives in `localStorage`: clearing site data clears it, and in a privacy window it is kept in memory only until the page closes.
- A note says what happened, not why. It adds the browser's own numbers and your `context`, nothing deeper.

## Prior art
- [web-vitals](https://github.com/GoogleChrome/web-vitals) (Apache-2.0, 6.2.3): Google's library for measuring page-load and interaction metrics (CLS, FCP, INP, LCP, TTFB). Its attribution build is 15.7 KB (5.5 KB gzipped) as one script and hands each metric to your callback so you can send it where you like. It does not catch errors and does not keep a local note. Use it when you want field metrics in your own analytics; use this when you want a note the player can copy and nothing leaves the device.
- Error-reporting services (Sentry and similar) send data to a server by design.

## For AI agents
Start it once, early, with a `key` that names the game and a `context` that returns the game's state in a few words. Add a "Copy note" and a "Clear note" button where players find help, and say in the page that nothing leaves the device. Do not add a network call to it.
