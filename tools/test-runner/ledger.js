/* Copyright (c) 2026 LFC Foundry. MIT License. Resume and alarm for long test runs: a ledger of finished (build, browser, suite) cells and a heartbeat file that records the machine's boot id.
     A finished cell is written to disk, so after a machine restart `cli.js all` skips what already passed and continues at the first unfinished browser.
     `cli.js status` (or `all --status`) says ALIVE, FINISHED or DEAD, and DEAD names the reason (machine restarted, or the process is gone without a finish mark). */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const root = path.resolve(__dirname, '..', '..');
const dirOf = () => process.env.TEST_RUNNER_LEDGER || process.env.TEST_RUNNER_CACHE && path.join(process.env.TEST_RUNNER_CACHE, 'ledger') || path.join(root, '.cache', 'test-runner', 'ledger');
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const alive = (pid) => {
  try { process.kill(pid, 0); } catch (e) { return e.code === 'EPERM'; }
  try { return !/^\d+ \(.*\) [ZX]/.test(fs.readFileSync('/proc/' + pid + '/stat', 'utf8')); } catch (e) { return true; }   // a killed process nobody collected still answers kill(pid, 0): its state is Z
};
const safe = (s) => String(s).replace(/[^\w.-]/g, '_');

/** The id of this boot of the machine: it changes when the machine restarts. Without /proc, the start time of the machine rounded to a minute. */
function bootId() {
  try { return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(); } catch (e) { /* not Linux */ }
  return 'up-' + Math.round((Date.now() - os.uptime() * 1000) / 60000);
}

/** What was built: TEST_RUNNER_BUILD when set, otherwise the commit plus every uncommitted change (tracked diff and the name, size and time of each untracked file). */
function buildId(cwd) {
  if (process.env.TEST_RUNNER_BUILD) return process.env.TEST_RUNNER_BUILD;
  const git = (a) => { try { return cp.execFileSync('git', a, { cwd: cwd || root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return ''; } };
  const head = git(['rev-parse', 'HEAD']).trim(), diff = git(['diff', 'HEAD']);
  const extra = git(['ls-files', '-o', '--exclude-standard']).split('\n').filter(Boolean).filter((f) => !/^\.cache\//.test(f)).map((f) => { try { const s = fs.statSync(path.join(cwd || root, f)); return f + ':' + s.size + ':' + Math.round(s.mtimeMs); } catch (e) { return f; } });
  return head ? sha(head + '\0' + diff + '\0' + extra.join('\n')).slice(0, 12) : 'nogit';
}

/** The suite: the check file plus the arguments it is run with, so a different argument is a different suite. */
const suiteId = (script, args) => safe(path.basename(script)) + (args && args.length ? '-' + sha(args.join('\0')).slice(0, 6) : '');

const cellFile = (build, suite, browser) => path.join(dirOf(), 'cells', safe(build) + '__' + suite + '__' + browser + '.json');
const heartFile = (suite) => path.join(dirOf(), 'heartbeat-' + suite + '.json');
const write = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, f); };
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

/** A cell that already passed (or was skipped on purpose) for this build, or null. A failed cell is never reused: a resume must not hide a failure. */
function done(build, suite, browser) {
  const c = read(cellFile(build, suite, browser));
  return c && (c.status === 'pass' || c.status === 'skipped') ? c : null;
}
function record(build, suite, browser, c) { write(cellFile(build, suite, browser), Object.assign({ build, suite, browser, boot: bootId(), at: new Date().toISOString() }, c)); }

/** The heartbeat of one `all` run. beat(patch) merges the patch and stamps the time; call it at every cell and on a timer while a cell runs. */
function heartbeat(suite, init) {
  const f = heartFile(suite);
  const state = Object.assign({ suite, pid: process.pid, boot: bootId(), startedAt: Date.now(), state: 'running', current: null, cells: {} }, init);
  const beat = (patch) => { Object.assign(state, patch); state.updatedAt = Date.now(); write(f, state); };
  beat({});
  return { beat, state, timer: (ms) => { const t = setInterval(() => beat({}), ms || 5000); t.unref(); return t; } };
}

/** ALIVE, FINISHED or DEAD for one heartbeat: { verdict, reason, hb } */
function judge(hb) {
  if (!hb) return { verdict: 'NONE', reason: 'no run was recorded for this suite' };
  if (hb.state === 'finished') return { verdict: 'FINISHED', reason: 'finished ' + (hb.failed ? 'with ' + hb.failed + ' failing cell' + (hb.failed > 1 ? 's' : '') : 'with every cell passing'), hb };
  if (hb.boot !== bootId()) return { verdict: 'DEAD', reason: 'the machine restarted since the run began (up ' + Math.round(os.uptime()) + ' s); rerun the same command and it resumes after the cells that finished', hb };
  if (!alive(hb.pid)) return { verdict: 'DEAD', reason: 'the process (pid ' + hb.pid + ') is gone without a finish mark (crash or kill); rerun the same command and it resumes', hb };
  return { verdict: 'ALIVE', reason: 'last heartbeat ' + Math.round((Date.now() - hb.updatedAt) / 1000) + ' s ago' + (hb.current ? ', running ' + hb.current : ''), hb };
}

/** Every recorded run (or the one suite) with its verdict and the cells finished for its build. */
function status(suite) {
  const d = dirOf(), out = [];
  for (const f of fs.existsSync(d) ? fs.readdirSync(d) : []) {
    const m = /^heartbeat-(.+)\.json$/.exec(f); if (!m || (suite && m[1] !== suite)) continue;
    const j = judge(read(path.join(d, f)));
    j.suite = m[1];
    j.cells = j.hb ? Object.keys(j.hb.cells || {}).map((b) => Object.assign({ browser: b }, j.hb.cells[b])) : [];
    out.push(j);
  }
  return out;
}

module.exports = { dirOf, bootId, buildId, suiteId, done, record, heartbeat, judge, status, version: '1.2.0' };
