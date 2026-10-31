# clip-writer developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.3.0 · API 1 · 2026-10-30

### Quick
New saving options: fastStart (MP4 index first), sidx (seek index for fragmented MP4) and output 'blob'. All off by default; existing files are unchanged.

### Deep
New options, all off by default (default output byte-identical to 1.2.0): fastStart puts the MP4 index before the pictures so a player can start early; sidx adds a segment index after the fragmented header so players can jump around (whole file only); output 'blob' / opts.blob returns a Blob built from the pieces without copying them into one array. Checks: ffmpeg decodes fast-start and sidx files (120 of 120 pictures, 208 of 208 sound frames) and seeks in the sidx file; 8 more Node checks (index order, chunk offsets, sidx sizes, Blob bytes equal array bytes, with and without sound). Speed (medians, three test browsers): fast-start and sidx cost 0 to 8% in Chromium and Firefox (within noise; WebKitGTK 0.2 to 0.4 ms clips show up to 1.20x at its 1 ms timer step). Blob output vs building the array then a Blob: Firefox 158 about 3.2x faster on 250-picture clips (0.44 vs 1.40 ms), same on the 150-picture clip; ungoogled Chromium 155 1.04x to 1.44x slower; WebKitGTK 2.52.6 0.86x to 1.10x. Because of the Chromium result Blob output stays opt-in.

## 1.2.0 · API 1 · 2026-10-30

### Quick
New: one sound track (Opus or AAC) in MP4 and fragmented MP4, with addAudio; fragmented pieces can be streamed into a MediaSource. Output without sound is unchanged.

### Deep
New: one sound track in MP4 and fragmented MP4. writeMp4/writeFmp4/writeFmp4Segments take an optional audio object (encoded packets, sample rate, channels, config, codec aac or opus); createWriter takes an audio option and addAudio([left, right]) to encode sound with the browser's AudioEncoder (Opus works in Firefox 158 and ungoogled Chromium 155; neither has an AAC encoder here); support() reports aac and opus. In a live onSegment stream the sound that has arrived goes into the next piece with its own start time. Checks: ffmpeg decodes AAC and Opus files with the same sound frames as the source and 120 of 120 pictures; 15 more Node read-back checks (200 random clips); live-streamed pieces play through MediaSource to the end (120 pictures decoded, 4.82 s) in Chromium 155 and Firefox 158; WebKitGTK 2.52.6 here has no H.264 decoder so it could not play them. Files without sound are byte-identical to 1.1.0 (600 random clips compared). Speed of the no-sound writers unchanged within noise in all three test browsers.

## 1.1.0 · API 1 · 2026-10-30

### Quick
New: fragmented MP4 output (writeFmp4, writeFmp4Segments, format 'fmp4' with live onSegment) for streaming and MediaSource. Normal MP4 and WebM files are unchanged.

### Deep
New: fragmented MP4 (fMP4). writeFmp4(samples,w,h,avcC) gives a start-up header plus one moof+mdat pair per run of pictures starting at a key picture; writeFmp4Segments gives the header and each piece separately for MediaSource or sending one by one; createWriter({format:'fmp4', onSegment}) hands each piece over as soon as the next key picture shows it is complete and keeps nothing in memory. ffmpeg decodes it to the same pictures as the plain MP4 (3 clips). Speed: about the same as writeMp4 (within noise) and 3.4x to 7.2x faster than mp4-muxer's fragmented mode in the three test browsers (see /mnt/project-files/js-modules-research/clip-writer/FMP4-RESULTS-2026.10.30.md). File is 0.03% to 0.2% larger than the plain MP4. writeMp4 and writeWebm output is byte-identical to 1.0.1.

## 1.0.1 · API 1 · 2026-10-27

### Quick
Frame times that are not real numbers (infinite, NaN, negative, or too long for MP4) are refused with a clear error instead of producing broken video timing.

## 1.0.0 · API 1 · 2026-10-25

### Quick
New module: pictures into a short MP4 or WebM video, cut from Netflow Map.

### Deep
Shipped in JS-modules PR 177.
New module, cut from Netflow Map's video.js. Turns pictures into an MP4 (H.264) or WebM (VP9) file with the browser's own encoder and two small file writers, no libraries; same add/finish shape as gif-writer. About 8 times smaller than a GIF in Netflow Map (a 30,000 item map: about 5 MB per 100 pictures as GIF, about 0.65 MB as MP4). Two writer bugs found while adding the Node read-back test and fixed here: the MP4 header boxes (tkhd, vmhd, url) wrote their flags as a version, which Firefox's strict parser refused (Chromium and ffmpeg forgave it), and the WebM cue positions were off by 2 bytes once the positions needed a second byte, which would break seeking in long clips.
