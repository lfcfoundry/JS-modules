# fuzz-kit findings

## Baseline and previous work

- Reviewed main revision c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.
- Current tool is version 1.3.4, API 1.
- The October review's important fixes and features are already shipped: the in-page start deferral for frozen-page detection, Firefox's real Space key fix, --jobs, --swarm, --check-repeat, final checks, script replay, and pickVisible.
- The earlier review found the engine itself inexpensive relative to app operations, invariants, DOM checks, and browser startup. Its strongest gains were workload-level parallel seeds and avoiding full DOM scans for every random click.

## Local qualification

Host: Node v26.13.1, Android, arm64.

- node tools/fuzz-kit/test/run.js: 215 passed.
- python3 tools/fuzz-kit/test/runner_fakes.py: exit 0; all runner fake-page checks passed.

The browser test was not run here. The approved browser matrix is desktop Linux, while this review host is Android. Do not treat old browser results as new qualification.

## Diagnostic engine probes

I measured synthetic no-op operations and shrinker cases to find where to look. Timings varied substantially between repeats on this host, including more than a twofold spread in some no-op cases. They are diagnostic only and do not justify a release or a code change.

A representative 30,000-operation run with eight no-op choices took a 6.63 ms median in one short pass. Adding record:true took 22.21 ms; adding three empty invariants took 10.19 ms; a unique state string took 15.58 ms. Repeated runs changed enough that these figures should not be compared across builds. A synthetic 128-, 512-, or 2,048-entry script shrank to the same 16-entry prefix in 31 tries with the default strategy and 59 with pieces:true; timings were unstable and do not establish a winner for pieces:true.

These probes reveal the right variables to test, not a bottleneck. Unique cfg.state values grow the visited result map with the number of distinct states. Recording stores one script object per operation. Both costs are opt-in and expected; document their memory trade-offs rather than silently changing their semantics.

## Source pointers

- tools/fuzz-kit/src/fuzz-core.js: run() and runImpl() around lines 105-244.
- tools/fuzz-kit/src/fuzz-core.js: shrink() and shrinkImpl() around lines 245-315.
- tools/fuzz-kit/runner/background.js and the two browser runner entry points.
- tools/fuzz-kit/test/run.js and tools/fuzz-kit/test/runner_fakes.py.

## Finding

Do not optimize the core based on operation counts alone. A tiny no-op operation is not a browser operation. Attribute time across page creation/navigation, app operation, invariant checks, state serialization, and shrink replays before considering a new engine path.
