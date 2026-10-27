# clip-writer

**Version 1.0.1 · API 1**

**Tested in:** Node 22 read-back of every MP4 box and WebM element; Firefox 158, Chromium 155, WebKitGTK 2.52.6 real encode and playback

Turns pictures into a short MP4 or WebM video in the browser. The browser's own video encoder (WebCodecs) makes the H.264 or VP9 pictures and two small file writers here wrap them into a file you can save or play. **One file, no libraries, works offline.** The whole file is held in memory, which suits a slide-sized clip, not a film.

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry. Cut from Netflow Map, where it saves animations next to [gif-writer](../gif-writer/README.md).

## Why it exists
A GIF of a moving picture is big. In Netflow Map a 30,000 item map takes about 5 MB per 100 pictures as a GIF and about 0.65 MB as an MP4 (about 8 times smaller). The browser can already encode video, but it hands back raw encoded pictures without a file around them. This module is the missing file writer, and it is the same shape as gif-writer (`add` a picture, `finish` for the bytes), so a project that makes GIFs can offer video too.

## Use

```js
ClipWriter.support(640, 360, 25).then(function (s) {          // which formats this browser can make: { mp4: true/false, webm: true/false }
  var format = s.webm ? 'webm' : s.mp4 ? 'mp4' : null;
  if (!format) return;                                         // keep making a GIF
  var wr = ClipWriter.createWriter({ w: 640, h: 360, fps: 25, format: format, bitsPerPixel: 0.1 });
  var chain = Promise.resolve();
  pictures.forEach(function (rgba) { chain = chain.then(function () { return wr.add(rgba.buffer, 40); }); });   // RGBA bytes, how long it stays in ms
  return chain.then(function () { return wr.finish(); }).then(function (bytes) { /* Uint8Array: save as .mp4 or .webm */ });
});
```

`add(buffer, ms, width)` returns a promise: wait for it, the encoder may be catching up. Sizes are rounded down to even numbers. `bitsPerPixel` (default 0.1) sets the quality and the size. `cancel()` stops and lets go of the encoder. `writeMp4(samples, w, h, avcC)` and `writeWebm(samples, w, h)` are the two file writers on their own (they work in Node), for encoded pictures you already have.

## Limits
- Needs the browser's video encoder: Chromium has both MP4 and WebM, Firefox 158 both, WebKitGTK 2.52.6 WebM only here. Ask `support()` first and keep a GIF for the rest.
- On Firefox 158 for Linux the MP4 made from Firefox's own H.264 encoder opens in Firefox at the wrong size (16 x 160); the same writer's MP4 from Chromium's encoder opens in Firefox at 320 x 180, so use WebM there.
- WebKitGTK ignores the bitrate for VP9 and needs pictures that came from a canvas (this module always goes through one).
- Frame durations must be finite and nonnegative. MP4 clips longer than 4,294,967,295 ms do not fit its 32-bit time field and are refused.
- No sound, one track.

## Prior art and credits
The file layouts follow ISO/IEC 14496-12 (MP4) and the Matroska/WebM specification; the encoders are the browser's.

## For AI agents
Load `clip-writer.js` as a page script (global `ClipWriter`) or `require` it in Node for the writers only. Check `support()` before `createWriter`, await every `add`, and fall back to gif-writer when it says no format works. If you change the writers, run `node modules/clip-writer/test/run.js`: it reads back every box and element.
