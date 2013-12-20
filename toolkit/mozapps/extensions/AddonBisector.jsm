/* -*- Mode: javascript; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ft=javascript ts=2 sts=2 et sw=2: */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
const EXPORTED_SYMBOLS = ["AddonBisector"];

const {classes:Cc, interfaces:Ci, results:Cr, utils:Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Timer.jsm");

///// Random Utility Functions.

// Print a log message.
function d(msg, important) {
  if (!important) return; // Comment for debugging.

  let fm = "AddonBisector: " + msg;
  Services.console.logStringMessage(fm);
  dump(fm+"\n");
}

// JSON format, the log.
function dj(obj, i) {
  return d(JSON.stringify(obj, undefined, 4), i);
}

// Restart the browser.
function restart() {
  //return; // Uncomment for debugging.
  const Ss = Services.startup;
  Services.startup.quit(Ss.eAttemptQuit|Ss.eRestart);
}

function safeCall(where, cb, ...args) {
  try {
    return cb.apply(undefined, args);
  } catch (e) {
    Cu.reportError("Error calling callback for AddonBisector."+where+"().");
    Cu.reportError(e);
  }
}

///// Persistence.

const STORAGE_PREF = "toolkit.addonbisector.state";

let state = function(){
  try {
    let raw = Services.prefs.getCharPref(STORAGE_PREF);
    let d = JSON.parse(raw);

    // Make dates actually `Date`s.
    ["startdate","updatedate"].forEach(function(p){
      if (d[p]) d[p] = new Date(d[p]);
    });

    return d;
  } catch (_) {
    return undefined;
  }
}();

// Flush state to persistent storage.
function flush() {
  const p = Services.prefs

  if (!state) p.clearUserPref(STORAGE_PREF);
  else        p.setCharPref(STORAGE_PREF, JSON.stringify(state));
}

///// Related Utility Functions.

function toIDList(as) {
  return as.map(function(a){return a.id});
}

/**
 * Set the state of addons.
 * 
 * @param  map
 *         An object where the keys are the addon IDs and the values are truthy
 *         to enable or falsey to disable.
 * @param  cb
 *         A function to call once all the addons are enabled/disabled.
 */
function setAddonsState(map, cb) {
  AddonManager.getAddonsByIDs(Object.keys(map), function(ads){
    for (let i in ads) {
      let a = ads[i];

      a.userDisabled = !map[a.id]; // Map is true for enabled.
    }

    cb();
  });
}

// Setup the next iteration and restart.
function next() {
  let emap = {}; // New addon states.

  if (state.runs == 0) { // First run.
    for (let i in state.u) {
      let a = state.u[i];
      emap[a.id] = a.enabled = false; // Disable all.
    }
  } else if (state.u.length <= 1) { // Finished.
    state.g.concat(state.u).forEach(function(a){
      emap[a.id] = a.orig;
    });

    state = null;
  } else {
    let n = state.u.length;
    for (let i in state.u) {
      let a = state.u[i];

      emap[a.id] = a.enabled = (i < n/2);
    }
    for (let i in state.g) { // We want none of the good ones.
      let a = state.g[i];

      emap[a.id] = a.enabled = false;
    }
  }

  if (state) state.runs++;
  flush();

  setAddonsState(emap, restart);
}

///// Actual API.

const AddonBisector = {

  /// There is no bisection running.
  STATE_NONE: 0,
  /// There is currently a bisection ongoing.
  STATE_RUNNING: 1,
  /// The ongoing bisection is complete and the results are ready.
  STATE_DONE: 3,

  /**
   * If a bisection is currently in progress.
   */
  get state(){
    if (!state)                  return AddonBisector.STATE_NONE;
    else if (state.u.length > 1) return AddonBisector.STATE_RUNNING;
    else                         return AddonBisector.STATE_DONE;
  },

  /**
   * The number of iterations.
   *
   * @return The number of iterations this bisection has performed.
   */
  get runs() {
    return state && state.runs;
  },

  /**
   * The bad addon.
   *
   * @return undefined if not done, otherwise the bad addon or undefined if no
   *         addon was found to be bad (firefox problem).
   */
  get badAddons() {
    if (!state) return [];
    else        return toIDList(state.u);
  },

  /**
   * The list of known good addons.
   *
   * @return An Array of id strings.
   */
  get goodAddons(){
    return state && toIDList(state.g);
  },

  /**
   * A list of addons with unknown allegiance.
   *
   * @return An Array of id strings.
   */
  get unknownAddons(){
    return state && toIDList(state.u);
  },

  /**
   * Start a Bisection.
   *
   * @param  cb
   *         A callback to be called when initialization is done.  It will be
   *         passed a callback to call and a stats object.  The callback should
   *         eventually be called to restart the browser and start the bisection.
   * @param  o
   *         Options to control the bisection.  This object includes:
   *
   *         all: If set to a truthy value all addons will be considered, otherwise
   *              disabled addons will not be tested.
   */
  start: function AB_start(cb, o) {
    if (typeof cb !=  "function") throw TypeError("Callback must be a function.");
    if (typeof o  == "undefined") o = {};
    o.all = !!o.all;

    state = {
      startdate: new Date(),
      runs: 0, // The current run number.
      u: [],   // Unknown addons.
      g: [],   // Good addons.
      h: [],   // Log/History.
    };

    AddonManager.getAllAddons(function(aos){
      aos.forEach(function(a){
        if (o.all ? a.appDisabled : !a.isActive) return; // Skip disabled.
        if (a.type != "extension") return;

        state.u.push({
          id: a.id,
          enabled: false,
          orig: !a.userDisabled,
        });
      });

      safeCall("start", cb, next);
    });
  },

  /**
   * Mark the current state as good or bad.
   *
   * @param  cb
   *         A callback that will be called with a continuation function and a
   *         stats object.  The continuation function should be called to do the
   *         next bisection or cleanup.
   * @param  good
   *         A boolean value representing if the current state is considered "good".
   */
  mark: function AB_mark(cb, good) {
    if (!state) throw new Error("Can't call mark() if not STATE_RUNNING.");
    if (typeof cb != "function") throw new TypeError("Callback must be a function.");
    good = !!good;

    for (let i = state.u.length; i--; ) {
      let a = state.u[i];

      if (a.enabled == good) {
        d("Marking "+a.id+" good.");
        state.u.splice(i, 1);
        state.g.push(a);
      }
    }

    // Even though we don't currently make any async calls we may wish
    // to in the future.
    setTimeout(safeCall.bind("mark", cb, next), 0); // Call it next tick.
  },

  /**
   * Abort current bisection.
   *
   * This removes any old state.  Unless discard is set the state of the browser
   * is reset to how it was before the bisection started.
   *
   * @param  discard
   *         If provided and true, don't attempt to restore the original state.
   *         If provided the browser also won't be restarted.
   */
  abort: function AB_abort(discard) {
    if (!state) {
      if (!discard) restart(); // We promise to restart.
      return;
    }

    if (!discard) {
      let emap = {};
      let all = state.u.concat(state.g);

      for (let i in all) {
        let a = all[i];
        emap[a.id] = a.orig;
      }

      setAddonsState(emap, restart);
    }

    state = null;
    flush();
  },

  dumpDebugInfo: function AB_dumpDebugInfo() {
    dj(state, true);
  },
};

Object.freeze(AddonManager);
