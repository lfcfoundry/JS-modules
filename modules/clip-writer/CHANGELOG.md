# clip-writer changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-30
- New: one sound track (Opus or AAC) in MP4 and fragmented MP4, with addAudio; fragmented pieces can be streamed into a MediaSource. Output without sound is unchanged.

## 1.1.0 · API 1 · 2026-10-30
- New: fragmented MP4 output (writeFmp4, writeFmp4Segments, format 'fmp4' with live onSegment) for streaming and MediaSource. Normal MP4 and WebM files are unchanged.

## 1.0.1 · API 1 · 2026-10-27
- Frame times that are not real numbers (infinite, NaN, negative, or too long for MP4) are refused with a clear error instead of producing broken video timing.

## 1.0.0 · API 1 · 2026-10-25
- New module: pictures into a short MP4 or WebM video, cut from Netflow Map.
