# sprite-baker changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-15
First labeled version (the number was already in the code). Adds `alphaMask`, `hit` and `toSheet`.

## Before version labels

- Early October 2026: First version: a tiny software 3D rasterizer that bakes toon-shaded shapes into 2D sprites.
- 2026-10-15: A triangle with a NaN height is skipped instead of corrupting later triangles; a size limit (`maxPixels`, default 4,194,304) stops a huge bake.
