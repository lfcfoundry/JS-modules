# netflow-engine changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 0.1.0 · API 0 · 2026-10-18
New placeholder module for the engine of Netflow Map, so other people can adapt it later. It has no engine code yet: the file only has `NetflowEngine.status()`, which says `placeholder: true`. The README says what the engine is and is not, the rule that every significant engine update will be published here as a new version, and a draft of how the Sankey, layout and network-map add-ons will plug in. Nothing to measure yet: 0 layouts, 0 bytes of engine (the file is under 1 KB).

Tested in: Node 22 checks only (3 checks). No browser was used because there is no engine code to run.
