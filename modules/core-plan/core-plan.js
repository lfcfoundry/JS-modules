/*!
 * core-plan.js: sizes a pool of helper workers from what the device reports (threads and memory), so a page never starts more
 * helpers than the machine can carry, and keeps a "last run" line so a page that crashed can say which step it was on.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   var p = LfcCorePlan.plan({ workerMB: 256 });   // { logical, cores, memGB, workers, duckThreads, sweep, why, label }
 *   for (var i = 0; i < p.workers; i++) startHelper();
 *   show(p.label);                                // "This device reports 8 threads (about 4 real cores assumed) and 8 GB. Plan: 3 helpers, ..."
 *   LfcCorePlan.lastRun.step('big file');         // before a risky step; after a crash and reload, lastRun.previous() names it
 *
 * navigator.hardwareConcurrency counts LOGICAL threads. With 8 or more, about half are real cores on most laptops and desktops, so the plan assumes
 * half. navigator.deviceMemory (GB, rounded and capped at 8 by Chromium-based browsers, missing in Firefox and Safari) limits the count too.
 * ES5, no network, no build step; safe to paste into a single-file page.
 */
(function (root) {
  'use strict';
  function num(x, d) { x = +x; return x > 0 && isFinite(x) ? x : d; }
  function detect(nav) {
    nav = nav || (typeof navigator === 'object' ? navigator : {});
    var logical = Math.floor(num(nav.hardwareConcurrency, 4)), mem = num(nav.deviceMemory, 0);
    var cores = logical >= 8 ? Math.ceil(logical / 2) : logical;   // assume hyper-threading from 8 threads up
    return { logical: logical, cores: cores, memGB: mem || null, memKnown: !!mem };
  }
  // opts: workerMB (memory one helper needs, default 256), maxWorkers (default 8), keepFree (cores left for the page, default 1),
  //       maxDuck (DuckDB threads cap, default 4), env (detect() result, for tests)
  function plan(opts) {
    opts = opts || {};
    var d = opts.env || detect(), workerMB = num(opts.workerMB, 256), maxW = Math.floor(num(opts.maxWorkers, 8)), keep = opts.keepFree === 0 ? 0 : Math.floor(num(opts.keepFree, 1));
    var memGB = d.memGB || 4;                                  // unknown memory: assume 4 GB (safe on phones)
    var byMem = Math.max(1, Math.floor(memGB * 1024 * 0.5 / workerMB)); // use at most half of the reported memory
    var byCores = Math.max(1, d.cores - keep);
    var workers = Math.max(1, Math.min(byCores, byMem, maxW));
    var duck = Math.max(1, Math.min(workers, Math.floor(num(opts.maxDuck, 4))));
    var why = workers === byMem && byMem < byCores ? 'limited by memory' : workers === maxW && maxW < byCores ? 'capped at ' + maxW : 'cores minus ' + keep;
    return {
      logical: d.logical, cores: d.cores, memGB: d.memGB, memKnown: d.memKnown,
      workers: workers, duckThreads: duck, why: why,
      // sizes to sweep in a "how many helpers" test: 1, 2, 4, ... never above the plan
      sweep: (function () { var s = [], k = 1; while (k < workers) { s.push(k); k *= 2; } s.push(workers); return s; })(),
      label: 'This device reports ' + d.logical + ' thread' + (d.logical > 1 ? 's' : '') + ' (about ' + d.cores + ' real core' + (d.cores > 1 ? 's' : '') + ' assumed)' + (d.memGB ? ' and ' + d.memGB + ' GB' : ', memory not reported') + '. Plan: ' + workers + ' helper' + (workers > 1 ? 's' : '') + (opts.maxDuck ? ', ' + duck + ' DuckDB thread' + (duck > 1 ? 's' : '') : '') + ' (' + why + ').'
    };
  }
  // Last-run line: call step('name') BEFORE each risky step and done() after the run. After a crash and reload,
  // previous() tells which step was running. Uses sessionStorage only (cleared with the tab), never localStorage.
  var KEY = 'lfc-core-plan-last-run';
  function store(v) { try { if (v === undefined) return sessionStorage.getItem(KEY); if (v === null) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, v); } catch (e) {} return null; }
  var lastRun = {
    previous: function () { var v = store(); if (!v) return ''; try { var o = JSON.parse(v); return o.done ? '' : 'Last run did not finish. It stopped during: ' + o.step + ' (' + o.at + ').'; } catch (e) { return ''; } },
    step: function (name) { store(JSON.stringify({ step: String(name), at: new Date().toLocaleTimeString(), done: false })); },
    done: function () { store(JSON.stringify({ step: 'finished', at: new Date().toLocaleTimeString(), done: true })); },
    clear: function () { store(null); }
  };
  var api = { detect: detect, plan: plan, lastRun: lastRun, version: '1.0.0', apiVersion: 1 };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LfcCorePlan = api;
})(typeof self !== 'undefined' ? self : this);
