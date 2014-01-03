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
  //if (!important) return; // Comment for debugging.

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

    dump("Error calling callback for AddonBisector."+where+"().\n");
    dump(e); dump("\n");
    dump(e.stack);
  }
}

///// Persistence.

const STORAGE_PREF = "toolkit.addonbisector.state";

let initialized = false;
let state = undefined;

// Flush state to persistent storage.
function flush() {
  d("flush()ing to disk.");

  const p = Services.prefs

  if (!state)
    p.clearUserPref(STORAGE_PREF);
  else {
    state.updatedate = new Date();
    p.setCharPref(STORAGE_PREF, JSON.stringify(state));
  }

  d("flush()ed.");
}

///// Related Utility Functions.

function toIDList(as) {
  return as.map(function(a){return a.id});
}

function checkInitialized() {
  if (!initialized)
    throw Components.Exception("AddonBisector is not initialized",
                               Cr.NS_ERROR_NOT_INITIALIZED,
                               Components.stack.caller.caller);
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
  AddonManager.getAddonsByIDs(Object.keys(map), function(addons){
    for (let i in addons) {
      let a = addons[i];

      a.userDisabled = !map[a.id]; // Map is true for enabled.
    }

    cb();
  });
}

// Setup the next iteration and restart.
function next() {
  let emap = {}; // New addon states.

  if (state.found) {
    state.g.concat(state.u).forEach(function(a){
      emap[a.id] = a.origEnabled;
    });

    state = undefined;
  } else if (state.runs == 0) { // First run.
    for (let i in state.u) {
      let a = state.u[i];
      emap[a.id] = a.enabled = false; // Disable all.
    }
  } else {
    let pivot = state.u.length/2;
    for (let i in state.u) {
      let a = state.u[i];

      emap[a.id] = a.enabled = (i < pivot);
    }
    for (let i in state.g) { // We want none of the good ones.
      let a = state.g[i];

      emap[a.id] = a.enabled = false;
    }
  }

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
    if (!initialized)
      return undefined;
    else if (!state)
      return AddonBisector.STATE_NONE;
    else if (state.found)
      return AddonBisector.STATE_DONE;
    else
      return AddonBisector.STATE_RUNNING;
  },

  /**
   * The number of iterations.
   *
   * @return The number of iterations this bisection has performed.  undefined
   *         if not running or done.
   */
  get runs() {
    return state && state.runs;
  },

  /**
   * The bad addon.
   *
   * @return undefined if not done, otherwise an Array of bad addons.  Note that
   *         this array may be empty which would indicate a problem with firefox
   *         (or another issue unrelated to the installed addons).
   */
  get badAddons() {
    if (state && state.found)
      return toIDList(state.u);
    else
      return undefined;
  },

  /**
   * The list of known good addons.
   *
   * @return An Array of id strings.  undefined if not running or done.
   */
  get goodAddons(){
    return state && toIDList(state.g);
  },

  /**
   * A list of addons with unknown allegiance.
   *
   * @return An Array of id strings.  undefined if not running or done.
   */
  get unknownAddons(){
    return state && (state.found?[]:toIDList(state.u));
  },

  /**
   * Initialize the module.
   *
   * Initializes AddonBisector if uninitialized then calls the callback.
   *
   * Note: This must be called before using this module.
   *
   * @param  cb
   *         A callback to be called with no arguments when AddonBisector has
   *         initialized.
   */
  init: function AB_init(cb) {
    if (typeof cb !=  "function")
      throw Components.Exception("Callback must be a function",
                                 Cr.NS_ERROR_INVALID_ARG);

    let safecb = safeCall.bind(undefined, "init", cb);

    d("init() called.");

    if (initialized) { // Already initialized.
      safecb();
      return;
    }

    d("Actualy init()ing.");

    // Perform the initialization.
    try {
      let raw = Services.prefs.getCharPref(STORAGE_PREF);
      let d = JSON.parse(raw);

      // Make dates actually `Date`s.
      [
        "startdate",
        "updatedate"
      ].forEach(function(p){
        if (d[p])
          d[p] = new Date(d[p]);
      });

      state = d;
    } catch (_) {
      state = undefined;
    }
    initialized = true;
    d("init() finished.");

    // This init() isn't actually async but in the future it likely will be.
    // call callback later so that people don't depend on it being synchronous.
    setTimeout(safecb, 0);
  },

  /**
   * Start a Bisection.
   *
   * Note: AddonBisector.init() must be called before this function, else an
   *       error will be thrown.
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
    checkInitialized();

    if (typeof cb != "function")
      throw Components.Exception("Callback must be a function",
                                 Cr.NS_ERROR_INVALID_ARG);

    if (typeof o == "undefined")
      o = {};
    o.all = !!o.all;

    state = {
      startdate: new Date(),
      found: false, // If the bad addon has been found.
      runs: 0,      // The current run number.
      u: [],        // Unknown addons.
      g: [],        // Good addons.
    };

    AddonManager.getAllAddons(function(aos){
      aos.forEach(function(a){
        if (o.all ? a.appDisabled : !a.isActive)
          return; // Skip disabled.
        if (a.type != "extension")
          return;

        state.u.push({
          id: a.id,
          enabled: false,
          origEnabled: !a.userDisabled,
        });
      });

      if (state.u.length == 0) // You have no addons silly!
        state.found = true;

      safeCall("start", cb, next);
    });
  },

  /**
   * Mark the current state as good or bad.
   *
   * Note: AddonBisector.init() must be called before this function, else an
   *       error will be thrown.
   *
   * @param  cb
   *         A callback that will be called with a continuation function and a
   *         stats object.  The continuation function should be called to do the
   *         next bisection or cleanup.
   * @param  good
   *         A boolean value representing if the current state is considered "good".
   */
  mark: function AB_mark(cb, good) {
    checkInitialized();
    if (!state)
      throw new Error("Can't call mark() if not STATE_RUNNING");

    if (typeof cb != "function")
      throw Components.Exception("Callback must be a function",
                                 Cr.NS_ERROR_INVALID_ARG);

    good = !!good;

    for (let i = state.u.length; i--; ) {
      let a = state.u[i];

      if (a.enabled == good) {
        d("Marking "+a.id+" good.");
        state.u.splice(i, 1);
        state.g.push(a);
      }
    }

    state.runs++;
    if (state.u.length <= 1)
      state.found = true;

    // Even though we don't currently make any async calls we may wish
    // to in the future.
    setTimeout(safeCall.bind(undefined, "mark", cb, next), 0); // Call it next tick.
  },

  /**
   * Abort current bisection.
   *
   * This removes any old state.  Unless discard is set the state of the browser
   * is reset to how it was before the bisection started.
   *
   * Note: AddonBisector.init() must be called before this function, else an
   *       error will be thrown.
   *
   * @param  discard
   *         If provided and true, don't attempt to restore the original state.
   *         If provided the browser also won't be restarted.
   */
  abort: function AB_abort(discard) {
    checkInitialized();
    if (!state) {
      if (!discard) restart(); // We promise to restart.
      return;
    }

    if (!discard) {
      let emap = {};
      let all = state.u.concat(state.g);

      for (let i in all) {
        let a = all[i];
        emap[a.id] = a.origEnabled;
      }

      setAddonsState(emap, restart);
    }

    state = undefined;
    flush();
  },

  dumpDebugInfo: function AB_dumpDebugInfo() {
    dj(state, true);
  },
};

Object.freeze(AddonManager);
