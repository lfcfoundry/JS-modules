#!/usr/bin/env node
/* Copyright (c) 2026 LFC Foundry. MIT License. Names the commit that broke something.
     node tools/test-runner/bisect.js <good> <bad> [--repo DIR] [--timeout SECONDS] [--link node_modules,...] [--no-verify] -- <command...>
   Walks the commits between <good> (the command passes) and <bad> (it fails) by halving, in a throwaway copy of the files (a git worktree), so your own files are not touched.
   The command's exit code decides: 0 = good, 125 = this commit cannot be tested (skipped), anything else = bad. It prints the first bad commit, who wrote it, the files it changed and how many runs it took
   (log2 of the number of commits, so 1,000 commits take 10 runs). Use a quick targeted check as the command. --link makes those folders in the copy point at yours (for node_modules). */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
function git(repo, args, o) { const r = cp.spawnSync('git', args, Object.assign({ cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26 }, o)); if (r.status !== 0 && !(o && o.soft)) throw new Error('git ' + args.join(' ') + ': ' + (r.stderr || r.stdout)); return r; }
/** opts: { repo, link: [folders], timeoutMs, verify, log }. Resolves { first, steps, runs, skipped } where first is { sha, subject, author, files } or null when the endpoints do not behave as promised. */
function bisect(good, bad, argv, opts) {
  opts = opts || {}; const repo = path.resolve(opts.repo || '.'), log = opts.log || (() => {});
  const list = git(repo, ['rev-list', '--reverse', '--ancestry-path', good + '..' + bad]).stdout.split('\n').filter(Boolean);   // oldest first; the last one is <bad>
  if (!list.length) throw new Error(bad + ' is not newer than ' + good);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bisect-')), wt = path.join(dir, 'wt'); let runs = 0, skipped = 0;
  git(repo, ['worktree', 'add', '--detach', '-f', wt, list[list.length - 1]]);
  try {
    for (const l of opts.link || []) { const src = path.resolve(repo, l); if (fs.existsSync(src)) { try { fs.rmSync(path.join(wt, l), { recursive: true, force: true }); } catch (e) { /* none */ } fs.symlinkSync(src, path.join(wt, l)); } }
    const test = (sha) => {
      git(wt, ['checkout', '-q', '--detach', sha]); runs++;
      const r = cp.spawnSync(argv[0], argv.slice(1), { cwd: wt, stdio: opts.quiet ? 'ignore' : 'inherit', timeout: (opts.timeoutMs || 600000) });
      const code = r.status === null ? 1 : r.status; log(sha.slice(0, 9) + ' ' + (code === 0 ? 'good' : code === 125 ? 'skipped' : 'bad')); return code === 0 ? 'good' : code === 125 ? 'skip' : 'bad';
    };
    if (opts.verify !== false) {
      const g = git(repo, ['rev-parse', good]).stdout.trim();
      if (test(g) !== 'good') { log('the command does not pass on ' + good + ', so there is nothing to find'); return { first: null, runs, skipped }; }
      if (test(list[list.length - 1]) !== 'bad') { log('the command does not fail on ' + bad); return { first: null, runs, skipped }; }
    }
    let lo = 0, hi = list.length - 1;   // list[hi] is bad; everything before list[lo] is good
    while (lo < hi) {
      let mid = (lo + hi) >> 1, res = test(list[mid]);
      for (let k = 1; res === 'skip' && mid - k >= lo; k++) { skipped++; res = test(list[mid - k]); if (res !== 'skip') mid -= k; }   // look for a testable neighbor below
      if (res === 'skip') { skipped++; break; }
      if (res === 'good') lo = mid + 1; else hi = mid;
    }
    const sha = list[hi], info = git(repo, ['show', '-s', '--format=%an%n%s', sha]).stdout.split('\n'), files = git(repo, ['show', '--name-only', '--format=', sha]).stdout.split('\n').filter(Boolean);
    return { first: { sha, subject: info[1], author: info[0], files }, runs, skipped, commits: list.length };
  } finally { git(repo, ['worktree', 'remove', '--force', wt], { soft: true }); fs.rmSync(dir, { recursive: true, force: true }); }
}
if (require.main === module) {
  const a = process.argv.slice(2), dd = a.indexOf('--');
  if (dd < 2) { console.log('usage: bisect.js <good> <bad> [--repo DIR] [--timeout SECONDS] [--link node_modules] [--no-verify] -- <command...>'); process.exit(2); }
  const opt = (n) => { const i = a.indexOf(n); return i >= 0 && i < dd ? a[i + 1] : undefined; };
  try {
    const r = bisect(a[0], a[1], a.slice(dd + 1), { repo: opt('--repo'), timeoutMs: opt('--timeout') ? +opt('--timeout') * 1000 : undefined, link: opt('--link') ? opt('--link').split(',') : [], verify: !a.includes('--no-verify'), log: (m) => console.log('bisect: ' + m) });
    if (!r.first) process.exit(1);
    console.log('\nFIRST BAD COMMIT ' + r.first.sha + '\n  ' + r.first.subject + '\n  by ' + r.first.author + '\n  changed: ' + r.first.files.join(', ') + '\n  ' + r.runs + ' runs for ' + r.commits + ' commits' + (r.skipped ? ', ' + r.skipped + ' skipped' : ''));
  } catch (e) { console.log('bisect: ' + e.message); process.exit(1); }
}
module.exports = { bisect };
