# clip-writer

**Version 1.2.0 · API 1**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

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

`add(buffer, ms, width)` returns a promise: wait for it, the encoder may be catching up. Sizes are rounded down to even numbers. `bitsPerPixel` (default 0.1) sets the quality and the size. `cancel()` stops and lets go of the encoder. `writeMp4(samples, w, h, avcC)`, `writeFmp4(samples, w, h, avcC)` and `writeWebm(samples, w, h)` are the file writers on their own (they work in Node), for encoded pictures you already have.

**Fragmented MP4** (`format: 'fmp4'`, H.264 like `mp4`): a small start-up header, then one piece for every run of pictures that starts at a key picture. Each piece can be appended to a `MediaSource`, sent over a connection, or the whole file saved as one. `writeFmp4Segments(...)` returns `{ init, fragments }` as views into one buffer. With `createWriter({ ..., format: 'fmp4', onSegment: function (bytes, isInit) { ... } })` each piece is handed over as soon as the next key picture arrives and nothing is kept, so `finish()` resolves to `null`. Key pictures come every 50 pictures; `support()` also reports `fmp4`.

**Sound** (MP4 and fragmented MP4, one track): `writeMp4(samples, w, h, avcC, audio)` and `writeFmp4(..., audio)` take `audio = { samples: [{ data, ticks }], sampleRate, channels, config, codec }`: `data` is one encoded packet, `ticks` its length in 1 / sampleRate seconds (1024 for AAC, 960 for Opus), `config` the encoder's setup bytes (AAC: AudioSpecificConfig; Opus: the OpusHead record, `codec: 'opus'`, sample rate 48000). With the encoder doing the work: `createWriter({ ..., format: 'mp4' or 'fmp4', audio: { sampleRate: 48000, channels: 2, codec: 'opus', bitrate: 96000 } })`, then `wr.addAudio([left, right])` (Float32Array per channel, samples in -1..1) next to each `add`. `support()` reports `aac` and `opus` (Firefox 158 and ungoogled Chromium 155 here: Opus only). In a live `onSegment` stream the sound that has arrived goes into the next piece, each with its own start time.

## Limits
- Needs the browser's video encoder: Chromium has both MP4 and WebM, Firefox 158 both, WebKitGTK 2.52.6 WebM only here. Ask `support()` first and keep a GIF for the rest.
- On Firefox 158 for Linux the MP4 made from Firefox's own H.264 encoder opens in Firefox at the wrong size (16 x 160); the same writer's MP4 from Chromium's encoder opens in Firefox at 320 x 180, so use WebM there.
- WebKitGTK ignores the bitrate for VP9 and needs pictures that came from a canvas (this module always goes through one).
- Frame durations must be finite and nonnegative. MP4 clips longer than 4,294,967,295 ms do not fit its 32-bit time field and are refused.
- One sound track at most, in MP4 only (not WebM). AAC needs a browser AAC encoder (none in the test browsers here; use Opus or bring packets from your own encoder).

## Prior art and credits
The file layouts follow ISO/IEC 14496-12 (MP4) and the Matroska/WebM specification; the encoders are the browser's.

## For AI agents
Load `clip-writer.js` as a page script (global `ClipWriter`) or `require` it in Node for the writers only. Check `support()` before `createWriter`, await every `add`, and fall back to gif-writer when it says no format works. If you change the writers, run `node modules/clip-writer/test/run.js`: it reads back every box and element.
