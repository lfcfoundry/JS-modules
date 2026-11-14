# P13g Findings and Regression Coverage

## Behavior under test

At the audited baseline, `modules/lfc-pack/src/nested.js` contains `eqOff` at line 421 and the nested equality path in `rowsOf` at lines 422 onward. For a string predicate, P13g can read the predicate in its one-pass path when its preceding fields are only plain strings: `eqOff` counts those strings. It returns `-1` if an object or list (`kind === 0`) precedes the predicate because the string-only offset cannot identify the value safely.

When the one-pass loop encounters that unsupported layout, it sets the failure state and exits. Rows that matched earlier may already have been built in the temporary `one` array. The fallback does not return that partial array: it resets the string and column cursors, scans rows with `peekRow` to collect matching row indexes, resets cursors again, and builds the selected rows. This is the P13f-style two-pass fallback. The test targets the exact fallback condition in the generated bundle and records the row index and current partial-match count in memory.

## Coverage in `p13g-late-fallback.cjs`

- A one-block object-before-predicate fixture that reaches the fallback at row 3 after two matches have accumulated.
- A separate list-before-predicate fixture that reaches the fallback after the same two prior matches.
- Assertions that the traced shape places the object/list before the predicate and that the returned rows have the expected values, order, and no duplicates.
- A mixed numeric/string predicate fixture that makes the `COLS` cursor reset observable.
- A late fallback with zero prior matches, absent-query behavior, explicit-null versus missing-key behavior, and an all-match eligible case that should not fall back.
- Equality projection that omits the predicate key, and inclusive range projection that omits the range key.
- An independent oracle: fully unpack the file, then use ordinary JavaScript own-property checks, strict equality or inclusive numeric range comparisons, and a simple projection helper.

The fixture is deterministic and checks that packing creates one nested block. It does not depend on timings.

## Fault-injection evidence

Controlled, in-memory-only mutations of the loaded bundle showed:

- Omitting the `TI` reset makes the focused test disagree with the full-unpack oracle.
- Omitting the `COLS` reset makes the mixed-type fixture disagree with the oracle.
- Omitting the `SCOLS` reset did not fail. This fallback fixture does not exercise the relevant per-path string-column representation, so the test does **not** qualify the `SCOLS` reset. Do not infer otherwise.

The mutations were not written to the repository and are not included as executable test code. The focused test itself instruments the fallback branch; reset fault injection was a separate qualification exercise.

## Remaining correctness limits

This is focused regression coverage, not exhaustive proof for every nested layout or file format edge case. In particular, `SCOLS` reset behavior remains outside this test's exercised representation. Claude should inspect the exact source and test before identifying any additional concrete gap; do not broaden the test without a demonstrated defect or a narrowly justified case.
