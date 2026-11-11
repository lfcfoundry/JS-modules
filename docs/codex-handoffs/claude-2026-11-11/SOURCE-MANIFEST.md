Copyright (c) 2026 LFC Foundry. MIT License.

# Source manifest

All candidate files below were copied byte-for-byte from detached November 10 candidates based on `69049ec1797d1fb3d32b4398ee974918fe8b79b2`. These SHA-256 values are of the copied branch files before documentation changes:

| Repository path | Candidate | SHA-256 |
|---|---|---|
| `modules/lfc-pack/src/pool.js` | Buffer transfer source | `5c751fe098a53c175fe959d7ab2bc2c0e342900100fc1f0f585f51c75cadd504` |
| `modules/lfc-pack/test/pool.cjs` | Buffer regression | `407a015cf63525adc162138eac7161496c6628b481177ebf1427691a3be11c38` |
| `modules/lfc-pack/lfc-pack.js` | Built candidate | `f18407bc5b7e6744662a079a7e07005cfcd38dd3196893fe58a2f287b3d8d217` |
| `modules/lfc-pack/lfc-pack-read.js` | Built candidate | `5295852c96dcae60a74e18ce48fd4b323602719b537b2840b1a8436833f1617e` |
| `modules/lfc-pack/viewer.html` | Built candidate viewer | `d4baf16f5e83d5fef2b879b4c4352f3504841aa9316a45ba8202e4bef01c4cc0` |
| `modules/netflow-plot/netflow-plot.js` | Combined plot proposal | `5f8b7c5f28aae3b7e7643d9bb51085ac62d39e82a16e66691019fe1da322a63b` |
| `modules/netflow-plot/test/run.js` | Plot regressions | `56824b5b72fad41379c9d10ead2390016e3a8034ba47ee6921ac8282028ae47b` |
| `modules/netflow-scene/netflow-scene.js` | SVG scalar proposal | `601d7467cb758d8d1eec05d3739d41580736205d96e6bb82d33dee2848c3c3f5` |
| `modules/netflow-scene/test/run.js` | Scene regressions | `3a9fe8c8a4649ce81b6929ceed65f2939f2a987aece62faa9b1559eaf6aeb49c` |

The handoff directory also contains six task/status documents, `PERFORMANCE-ENGINEERING-FRAMEWORK.md`, `PERFORMANCE-VALIDATION.md`, `evidence/buffer-transfer-review.cjs`, `evidence/buffer-transfer-results.jsonl`, `evidence/copy-cost-pilot.cjs`, and `evidence/lfc-pack-baseline.js`. The baseline file is the exact parent built artifact. The transfer fixture was adapted only to load this branch by repository-relative path; the performance reports were given working branch-local links and copyright headers.

Excluded: the divergent local LFC-pack handoff branch, dirty integration worktrees, secrets, unrelated modules, and external browser binaries. The sibling Netflow Map handoff carries product-side vendor source, its tests, generated page artifacts, and the full-suite stall evidence.
