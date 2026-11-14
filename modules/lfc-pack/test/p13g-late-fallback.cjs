// Copyright (c) 2026 LFC Foundry. MIT License.
// P13g must discard partial one-pass matches and reset its cursors when a later row
// places a plain-string predicate after an object or list. The bundle is instrumented
// in memory only; the generated production bundle is never modified.
'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const bundlePath = require.resolve('../lfc-pack.js');
const fallbackNeedle = 'if (pl.eqo < 0) { ok1 = false; break; }';
const traceName = '__lfcpP13gLateFallbackTrace';

function loadWithFallbackTrace() {
  const source = fs.readFileSync(bundlePath, 'utf8');
  assert.strictEqual(source.split(fallbackNeedle).length - 1, 1,
    'the pinned bundle must have exactly one P13g late-fallback site');
  const instrumented = source.replace(fallbackNeedle,
    'if (pl.eqo < 0) { globalThis.' + traceName + '.push({ row: i, partialMatches: one.length, key: eqk, keys: pl.keys.slice(), kinds: pl.kind.slice() }); ok1 = false; break; }');
  const loaded = new Module(bundlePath, module);
  loaded.filename = bundlePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(bundlePath));
  loaded._compile(instrumented, bundlePath);
  return loaded.exports;
}

const owns = (row, key) => Object.prototype.hasOwnProperty.call(row, key);
function project(row, keys) {
  const out = {};
  for (const key of keys) if (owns(row, key)) out[key] = row[key];
  return out;
}
function jsonl(rows) {
  return Buffer.from(rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}
function equalOracle(rows, key, value, keys) {
  return rows.filter((row) => owns(row, key) && row[key] === value)
    .map((row) => project(row, keys));
}

async function packOneNestedBlock(JF, rows) {
  const bytes = await JF.pack(jsonl(rows), { block: 'nested', blockBytes: 1 << 20 });
  assert.strictEqual(JF.info(bytes).blocks, 1, 'fixture must exercise one shared nested block');
  return bytes;
}

async function checkEquality(JF, bytes, fullRows, value, keys) {
  const trace = globalThis[traceName];
  trace.length = 0;
  const got = await JF.unpack(bytes, { equals: { key: 'tag', value }, keys });
  assert.deepStrictEqual(got, equalOracle(fullRows, 'tag', value, keys),
    'equality projection must match full-unpack JavaScript filtering for ' + String(value));
  return trace.slice();
}

(async () => {
  globalThis[traceName] = [];
  try {
    const JF = loadWithFallbackTrace();
    await JF.init();

    const rows = [
      { id: 0, tag: 'hit', note: 'early-a', score: 10, meta: { group: 'a' }, items: ['x'] },
      { id: 1, tag: 'hit', note: 'early-b', score: 20, meta: { group: 'b' }, items: [] },
      { id: 2, tag: 'other', note: 'early-other', score: 5, meta: { group: 'c' }, items: [] },
      // `meta` is a top-level object before the target string key: P13g eqOff must reject this plan.
      { id: 3, meta: { group: 'object-first' }, tag: 'hit', note: 'late-object-hit', score: 10, items: [] },
      // A second unsupported layout puts a list before the target string key.
      { id: 4, items: ['list-first'], tag: 'hit', note: 'late-list-hit', score: 20, meta: { group: 'd' } },
      { id: 5, meta: { group: 'late-only' }, tag: 'late-only', note: 'late-only', score: null, items: [] },
      { id: 6, tag: null, note: 'explicit-null', score: null, meta: { group: 'null' }, items: [] },
      // `tag` is genuinely absent; equality-to-null must not treat this row as a match.
      { id: 7, meta: { group: 'missing' }, note: 'missing-tag', score: null, items: [] }
    ];
    const bytes = await packOneNestedBlock(JF, rows);
    const fullRows = await JF.unpack(bytes);
    assert.deepStrictEqual(fullRows, rows, 'full read must preserve the fixture as its oracle');
    const keys = ['id', 'tag', 'note'];

    const hitTrace = await checkEquality(JF, bytes, fullRows, 'hit', keys);
    assert.deepStrictEqual(hitTrace.map((x) => [x.row, x.partialMatches, x.key]), [[3, 2, 'tag']],
      'late object-first row must trigger fallback after two earlier matches were constructed');
    const objectIndex = hitTrace[0].keys.indexOf('meta'), predicateIndex = hitTrace[0].keys.indexOf('tag');
    assert(objectIndex >= 0 && objectIndex < predicateIndex && hitTrace[0].kinds[objectIndex] === 0,
      'traced fallback row must place an object before the string predicate');
    assert.deepStrictEqual((await JF.unpack(bytes, { equals: { key: 'tag', value: 'hit' } })).map((r) => r.id),
      [0, 1, 3, 4], 'both early and both later-layout matches must appear once and in row order');

    const withoutPredicate = await JF.unpack(bytes, {
      equals: { key: 'tag', value: 'hit' }, keys: ['id', 'note']
    });
    assert.deepStrictEqual(withoutPredicate, equalOracle(fullRows, 'tag', 'hit', ['id', 'note']),
      'fallback projection must remain correct when the predicate key is not requested');
    assert(withoutPredicate.every((row) => !owns(row, 'tag')),
      'projection must not reintroduce an omitted predicate key');

    // Exercise the list-before-predicate guard independently, after the same two partial matches.
    const listRows = rows.slice(0, 3).concat([{
      id: 8, items: ['list-first'], tag: 'hit', note: 'late-list-hit', score: 20, meta: { group: 'list' }
    }]);
    const listBytes = await packOneNestedBlock(JF, listRows);
    const listFull = await JF.unpack(listBytes);
    assert.deepStrictEqual(listFull, listRows, 'list-first fixture must round-trip before query comparison');
    const listTrace = await checkEquality(JF, listBytes, listFull, 'hit', ['id', 'note']);
    assert.deepStrictEqual(listTrace.map((x) => [x.row, x.partialMatches, x.key]), [[3, 2, 'tag']],
      'late list-first row must trigger fallback after two earlier matches were constructed');
    const listIndex = listTrace[0].keys.indexOf('items'), listPredicateIndex = listTrace[0].keys.indexOf('tag');
    assert(listIndex >= 0 && listIndex < listPredicateIndex && listTrace[0].kinds[listIndex] === 0,
      'traced list fallback row must place a list before the string predicate');
    assert.deepStrictEqual((await JF.unpack(listBytes, { equals: { key: 'tag', value: 'hit' }, keys: ['id', 'note'] })),
      equalOracle(listFull, 'tag', 'hit', ['id', 'note']),
      'list fallback must preserve matching rows when projection omits the predicate key');

    // Earlier rows use the numeric column for `tag`; the later string tag after an object
    // forces fallback. This makes the COLS cursor reset observable in the first fallback pass.
    const mixedRows = [
      { id: 20, tag: 7, note: 'numeric-a', score: 1, meta: { group: 'a' }, items: [] },
      { id: 21, tag: 7, note: 'numeric-b', score: 2, meta: { group: 'b' }, items: [] },
      { id: 22, tag: 3, note: 'numeric-other', score: 3, meta: { group: 'c' }, items: [] },
      { id: 23, meta: { group: 'object-first' }, tag: '7', note: 'late-string', score: 4, items: [] }
    ];
    const mixedBytes = await packOneNestedBlock(JF, mixedRows);
    const mixedFull = await JF.unpack(mixedBytes);
    assert.deepStrictEqual(mixedFull, mixedRows, 'mixed-type fixture must round-trip before query comparison');
    const mixedTrace = await checkEquality(JF, mixedBytes, mixedFull, 7, ['id', 'note']);
    assert.deepStrictEqual(mixedTrace.map((x) => [x.row, x.partialMatches, x.key]), [[3, 2, 'tag']],
      'numeric predicate matches before a later string/object layout must enter fallback after two rows');

    const lateOnlyTrace = await checkEquality(JF, bytes, fullRows, 'late-only', keys);
    assert.deepStrictEqual(lateOnlyTrace.map((x) => [x.row, x.partialMatches]), [[3, 0]],
      'fallback must also work when no earlier rows matched');
    const absentTrace = await checkEquality(JF, bytes, fullRows, 'absent', keys);
    assert.deepStrictEqual(absentTrace.map((x) => [x.row, x.partialMatches]), [[3, 0]],
      'an absent predicate must return no rows after taking the late fallback');
    const nullTrace = await checkEquality(JF, bytes, fullRows, null, keys);
    assert.deepStrictEqual(nullTrace.map((x) => [x.row, x.partialMatches]), [[3, 0]],
      'explicit-null comparison must survive the same late fallback');
    assert.deepStrictEqual((await JF.unpack(bytes, { equals: { key: 'tag', value: null } })).map((r) => r.id),
      [6], 'missing tag must not match null');

    // Numeric columns remain directly readable even when their row shape has earlier nested fields.
    globalThis[traceName].length = 0;
    const rangeKeys = ['id', 'score', 'note'];
    const range = await JF.unpack(bytes, { range: { key: 'score', min: 10, max: 20 }, keys: rangeKeys });
    const rangeOracle = fullRows.filter((row) => typeof row.score === 'number' && row.score >= 10 && row.score <= 20)
      .map((row) => project(row, rangeKeys));
    assert.deepStrictEqual(range, rangeOracle, 'inclusive projected range must match full-read filtering');
    assert.deepStrictEqual(range.map((r) => r.id), [0, 1, 3, 4], 'both inclusive range endpoints must be kept');
    assert.deepStrictEqual(globalThis[traceName], [], 'numeric range should not take the string-layout fallback');

    const rangeWithoutKey = await JF.unpack(bytes, {
      range: { key: 'score', min: 10, max: 20 }, keys: ['id', 'note']
    });
    const rangeWithoutKeyOracle = fullRows.filter((row) => typeof row.score === 'number' && row.score >= 10 && row.score <= 20)
      .map((row) => project(row, ['id', 'note']));
    assert.deepStrictEqual(rangeWithoutKey, rangeWithoutKeyOracle,
      'range projection must remain correct when the range key is not requested');
    assert(rangeWithoutKey.every((row) => !owns(row, 'score')),
      'projection must not reintroduce an omitted range key');

    const allMatchRows = [0, 1, 2].map((id) => ({ id, tag: 'all', note: 'all-' + id, meta: { id } }));
    const allMatchBytes = await packOneNestedBlock(JF, allMatchRows);
    const allMatchFull = await JF.unpack(allMatchBytes);
    const allTrace = await checkEquality(JF, allMatchBytes, allMatchFull, 'all', keys);
    assert.deepStrictEqual(allTrace, [], 'all-match eligible layout should complete without fallback');

    console.log('ok P13g late fallback: object/list fallback after 2 partial matches; zero-prior-match, absent, null/missing, omitted-key projections, and inclusive-range oracles passed');
  } finally {
    delete globalThis[traceName];
  }
})().catch((error) => { console.error(error); process.exit(1); });
