# grown-ups-door changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.0.1 · API 1 · 2026-10-31
- Same behavior, lighter in memory: the characters above U+00FF in the code (arrows, an ellipsis, curly quotes) are now written as escapes, so a page that bundles the file can keep its text at 1 byte per character.

## 1.0.0 · API 1 · 2026-10-17
- New module: buttons and links ask for a short task first (hold a round button, then drag an item to a target). It is a speed bump for small children, not security.
