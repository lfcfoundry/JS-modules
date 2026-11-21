<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Graphics and simulation modules

## gpu-blur

**Base:** `gpu-blur` 1.4.2. Start with `modules/gpu-blur/test/run.js`, `fuzz.js`, `mutants.js`, and the existing benchmark page.

Compare WebGL2, WebAssembly (SIMD and multithreaded where supported), plain JavaScript, and automatic selection. Use 1x1, odd dimensions, narrow/tall, 64x64, 1080p and largest stable images. Include transparent edges, opaque/transparent mixes, solid colors, impulse pixels, random RGBA, and radii at zero, small, normal, and documented maximum. Test Canvas, ImageBitmap, ImageData and raw bytes inputs/outputs.

Assert byte-for-byte identity for all routes, no input mutation, correct alpha/channel order, and safe behavior after WebGL context loss, worker refusal, missing SIMD, or readback failure. Benchmark setup/probe, warm blur, and readback separately. Record chosen backend and the reason, plus memory and file-size cost. Do not call the GPU route “faster” from GPU kernel time alone if readback makes the whole call slower.

## sprite-baker

**Base:** `sprite-baker` 1.11.0. Start with `modules/sprite-baker/test/run.js`, `fancy-scenes.js`, `reference-tri.js`, and the WebAssembly battery.

Use the current reference rasterizer with triangles covering flat color, depth overlap, shared/degenerate edges, near/far clipping, back faces, winding reversal, thin slivers, zero-area geometry, and maximum documented vertex/frame counts. Test shapes with one part, many parts, rings/capsules, transparent background, masks, and rolling sheets; vary output dimensions and antialias settings only where the API permits them.

Compare pixel bytes between WebAssembly and JavaScript paths and verify deterministic output over repeated calls. Include bounds/alpha and mask hit tests, empty geometry and invalid numeric inputs. Benchmark mesh preparation, one frame, full sheet generation, and release/cleanup separately. Track output bytes and peak canvas memory as frame count grows; stop before device instability.

## stage-curtains

**Base:** `stage-curtains` 1.4.3. Start with `modules/stage-curtains/test/run.js` and the worker browser test; current docs already claim worker allowed/refused pixel parity and busy-page timing.

Cross `prepare()` with worker allowed/refused, canvas available/unavailable, first call/reuse, visible/hidden page, and normal/slow device. For `close()` and `open()`, test normal Web Animations, missing API, stalled animation, rejected animation, timeout fallback, page hide, repeated calls, and close/open overlap. Use a controllable clock; do not sleep except when observing a real animation.

Every promise must settle once and no transition may leave a permanently covered page. Compare pixels for the documented worker and main-thread paths; test resize during preparation and teardown. Measure prepare cost, longest task, close/open duration, and idle overhead separately. Do not change the visual timing or promise semantics from performance data without an owner decision.

## walker-sim

**Base:** `walker-sim` 2.4.2. Start with `modules/walker-sim/test/run.js`, the minimum-build tests, and the existing demo.

Build graphs with one absorbing endpoint, several endpoints, a closed cycle, a dead end, disconnected components, self-loops, and weighted branches. Cover zero/one walker, fixed seeds, high and low transition probabilities, bounded/unbounded step counts, and each documented choice rule. Test exact-odds fixtures and boundary sizes; keep invalid blank names and malformed weights according to current documented behavior.

For a fixed seed, require byte-identical results across repeated calls and shipped builds. Where exact odds exist, compare exact values and verify simulated confidence intervals contain the answer at a predeclared confidence level over a deterministic seed set; do not make a flaky single-run assertion. For approximate cases, report sample count, standard error, and the existing 95% range. Benchmark setup, 1k/100k/1m walkers, and graph size separately across browsers. Compare the WebAssembly and JavaScript routes without combining simulation variability with timing variability.
