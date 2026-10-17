/*!
 * walker-sim-menu.js: the plain-words names, help texts and parameter labels of walker-sim's random-number kinds, for a settings page.
 * Optional: walker-sim.js draws all the numbers without it. Load walker-sim.js first; this file adds WalkerSim.DISTS and WalkerSim.DIST_BY.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 2.0.0 (API 2)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./walker-sim.js'));
  else factory(root.WalkerSim);
}(typeof self !== 'undefined' ? self : this, function (WalkerSim) {
  'use strict';
  /** name, plain-words help, whether it gives whole numbers, and what its three numbers mean. */
  var DISTS = [
    { id: 'fixed', name: 'Fixed value', discrete: false, blurb: 'Always the same number.', params: [{ k: 'a', label: 'Value' }] },
    { id: 'normal', name: 'Normal (Gaussian)', discrete: false, blurb: 'A bell curve around an average. Good for measurements and errors.', params: [{ k: 'a', label: 'Average' }, { k: 'b', label: 'Spread (standard deviation)' }] },
    { id: 'lognormal', name: 'Lognormal', discrete: false, blurb: 'Never negative and skewed to the high side. Good for sizes, durations and prices.', params: [{ k: 'a', label: 'Average' }, { k: 'b', label: 'Spread (standard deviation)' }] },
    { id: 'poisson', name: 'Poisson', discrete: true, blurb: 'Counts of things that happen independently at an average rate: arrivals, calls, defects.', params: [{ k: 'a', label: 'Average count' }] },
    { id: 'binomial', name: 'Binomial', discrete: true, blurb: 'How many of a fixed number of tries succeed.', params: [{ k: 'a', label: 'Number of tries' }, { k: 'b', label: 'Chance each time (0 to 1)' }] },
    { id: 'negbinomial', name: 'Negative binomial', discrete: true, blurb: 'Counts that vary more than Poisson (bursty arrivals).', params: [{ k: 'a', label: 'Average count' }, { k: 'b', label: 'Spread (standard deviation)' }] },
    { id: 'geometric', name: 'Geometric', discrete: true, blurb: 'How many tries until the first success.', params: [{ k: 'a', label: 'Average number of tries (1 or more)' }] },
    { id: 'exponential', name: 'Exponential', discrete: false, blurb: 'Waiting times when events are independent.', params: [{ k: 'a', label: 'Average' }] },
    { id: 'gamma', name: 'Gamma', discrete: false, blurb: 'Never negative; a flexible shape for durations and amounts.', params: [{ k: 'a', label: 'Average' }, { k: 'b', label: 'Spread (standard deviation)' }] },
    { id: 'weibull', name: 'Weibull', discrete: false, blurb: 'Lifetimes and delays; the shape says whether failures speed up or slow down.', params: [{ k: 'a', label: 'Typical size (scale)' }, { k: 'b', label: 'Shape (1 acts like exponential)' }] },
    { id: 'beta', name: 'Beta', discrete: false, blurb: 'A rate or share between 0 and 1 you are unsure about.', params: [{ k: 'a', label: 'Average (0 to 1)' }, { k: 'b', label: 'Spread (standard deviation)' }] },
    { id: 'uniform', name: 'Uniform', discrete: false, blurb: 'Anything between a lowest and a highest value is equally likely.', params: [{ k: 'a', label: 'Lowest' }, { k: 'b', label: 'Highest' }] },
    { id: 'triangular', name: 'Triangular', discrete: false, blurb: 'A best guess with a lowest and a highest possible value.', params: [{ k: 'a', label: 'Lowest' }, { k: 'b', label: 'Most likely' }, { k: 'c', label: 'Highest' }] },
    { id: 'pareto', name: 'Pareto', discrete: false, blurb: 'A few huge values and many small ones (wealth, sizes of cities).', params: [{ k: 'a', label: 'Smallest value' }, { k: 'b', label: 'Shape (bigger = lighter tail)' }] },
    { id: 'dunif', name: 'Whole-number uniform', discrete: true, blurb: 'Any whole number from a lowest to a highest, equally likely (a die roll).', params: [{ k: 'a', label: 'Lowest' }, { k: 'b', label: 'Highest' }] },
    { id: 'empirical', name: 'Resample from the data', discrete: false, blurb: 'Pick at random from the numbers in a column.', params: [] }
  ];
  var DIST_BY = {}; DISTS.forEach(function (d) { DIST_BY[d.id] = d; });

  var DIST_BY = {}; DISTS.forEach(function (d) { DIST_BY[d.id] = d; });
  WalkerSim.DISTS = DISTS; WalkerSim.DIST_BY = DIST_BY;
  return WalkerSim;
}));
