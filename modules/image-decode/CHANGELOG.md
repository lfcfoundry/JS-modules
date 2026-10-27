# image-decode changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.2.2 · API 1 · 2026-10-27
- Percent-coded data: addresses that hold binary pictures now load instead of being refused.

## 1.2.1 · API 1 · 2026-10-25
- Image decoding now frees its temporary address if the browser throws immediately.

## 1.2.0 · API 1 · 2026-10-22
- 1.2.0: new ImageDecode.ahead() decodes the next stage's sheets in idle time, so a stage change draws in 1.6 to 7 ms instead of 260 to 450 ms.

## 1.1.0 · API 1 · 2026-10-22
- A page that refuses blob: pictures (no img-src blob:) now loads through a background worker or a data: address instead of freezing; new option address: 'auto', 'blob', 'data' or 'worker'.

## 1.0.0 · API 1 · 2026-10-22
- New module: loads PNG, JPEG, WebP and AVIF pictures without freezing the page at the first draw (a 2048 sheet froze it 44 to 94 ms, now 2 to 9 ms), using the right way for each browser.
