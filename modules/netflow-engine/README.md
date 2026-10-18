# netflow-engine

**Version 0.1.0 · API 0**

**Status: placeholder.** No engine code yet.

**Tested in:** Node 22 checks only (3 checks: the file loads and says it is a placeholder). There is nothing to run in a browser yet, so no browser was used.

The engine of [Netflow Map](https://github.com/lfcfoundry), the part that takes a list of links, lays the map out and keeps the result ready to draw, shared here as a module that anyone can copy and adapt for their own use. **Today this is a placeholder:** the file holds the name, the version and one call, `NetflowEngine.status()`, so the folder, the version labels and the plans below have a fixed place before the code arrives. Do not build on it yet.

Forged by LFC Foundry. Copyright (c) 2026 LFC Foundry, MIT license.

## Why it exists

Netflow Map keeps getting faster and lighter (bigger maps laid out in seconds instead of half a minute, less memory while a map sits idle). Those gains live in its engine. The owner's rule (2026-10-18): **every significant update to the Netflow Map engine is published here as a new version of this module**, so other people can adapt it. This page is where the rule, the plan and the shape of the engine are written down.

## What is the engine, and what is not

| Piece | Where it ships | Status |
|---|---|---|
| **Engine** (this module): the core that turns links and options into a laid-out scene and keeps it, including how it stores big maps and when it lets go of memory | `netflow-engine` (this folder) | placeholder, 0.1.0 |
| **Layered layouts** (rows, tags for long links, columns) | [netflow-layers](../netflow-layers/README.md), already published | 1.2.0 |
| **Sankey flow chart** | [netflow-sankey](../netflow-sankey/README.md), already published | 2.0.0 |
| **Optimized network maps** (the regular node-and-link views) | to be published as an add-on once the engine is | not started |
| **Netflow Map itself** (the page, buttons, menus, styling) | its own private repository | not part of this module |

The engine stays separate from the add-ons on purpose: each one can be improved, versioned and adopted on its own. An add-on will plug into the engine; the engine will never need a particular add-on to run.

## How updates will ship

1. The Netflow Map team finishes an engine change and writes a short note (what changed, in numbers, from the four test browsers).
2. A new version of `netflow-engine` is published here with a plain-words changelog entry that says what each improvement is worth (for example "idle memory 8.5% lower, 30,000 items") or what each new feature does.
3. Netflow Map then uses the published version, like it already does with netflow-layers (project rule: games and apps adopt their JS-modules piece).
4. Add-ons keep their own version numbers. Their README says which engine versions they work with.

Version meaning is the repository's usual one: **0.x** while this is a placeholder or an unfinished first release, **1.0.0** when the engine code lands, then patch for a fix, minor for something new that breaks nobody, major when someone could be caught out (the API number equals the major).

## Draft: how an add-on will plug in

This part is a draft to be settled when the engine code arrives; nothing below exists yet.
- The engine owns the data (nodes, links, positions) and the lifecycle (build, idle, wake, let go).
- An add-on is a separate file that registers itself with the engine under a name and provides what the engine asks for (a layout, a drawing, a chart).
- An add-on never reaches into the engine's private storage; it uses the calls the engine documents, so the engine can change how it stores things (this has already happened several times in Netflow Map) without breaking add-ons.
- Each add-on lists the engine versions it was tested with in its **Tested in** line.

## Use

```js
NetflowEngine.status();   // { placeholder: true, version: '0.1.0', api: 0, message: '...' }
```
Check `placeholder` first. When the engine code lands (version 1.0.0) it becomes `false` and this section gets the real quick start.

## How it compares

Nothing to compare yet. When the code arrives this section will hold a table against the real alternatives (general graph-layout and graph-storage libraries), with speeds measured in the four test browsers one at a time and the direction (lower or higher is better) stated in every header, as the repository rules require.

## Prior art and credits

- The engine is Netflow Map's own, written by LFC Foundry. When the code is added, this section names every algorithm and library idea it uses.
- Related published pieces: [netflow-layers](../netflow-layers/README.md) (layered drawing) and [netflow-sankey](../netflow-sankey/README.md) (flow charts), both cut from Netflow Map.

## Limits

- It is a placeholder: no layout, no storage, no drawing. `status()` is the only call.
- No speed, size-in-memory or browser numbers exist for it, because there is no engine yet.
- The plug-in shape above is a plan, not an interface.

## For AI agents

When the engine code arrives: put it in `netflow-engine.js` (one file, ES5, UMD, no dependencies; if it must be several files, say why in this README), add real tests under `test/`, bump the version with `python3 tools/versions/versions.py set netflow-engine 1.0.0 --tested "..." --note "..."`, replace the placeholder text in this README and in `modules.json` (`summary`, `short`), add a demo page (`demo.html`, header from `tools/foundry-header.txt`), benchmark the real alternatives in the four test browsers for the release, and list the run in `TASKS.md`. Keep the engine free of any code that belongs to one add-on.
