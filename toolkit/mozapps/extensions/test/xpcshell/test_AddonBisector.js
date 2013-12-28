/* -*- Mode: javascript; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ft=javascript ts=2 sts=2 et sw=2: */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests AddonBisector.jsm

"use strict";

// Strict equality checking. ===
function do_check_seq(left, right, stack, todo) {
  stack = stack || Components.stack.caller;
  todo  = !!todo;

  var text = _wrap_with_quotes_if_necessary(left) + " === " +
             _wrap_with_quotes_if_necessary(right);
  do_report_result(left === right, text, stack, todo);
}

function todo_check_seq(left, right, stack) {
  stack = stack || Components.stack.caller;

  do_check_seq(left, right, stack, true);
}

Components.utils.import("resource://gre/modules/AddonManager.jsm");

// Set up AddonManager
createAppInfo("xpcshell@tests.mozilla.org", "XPCShell", "1", "1.9");
startupManager();

// Import and grab the global context of AddonBisector.
let abglobal = Components.utils.import("resource://gre/modules/AddonBisector.jsm");

// Catch the restart.  We are using bootstrapped addons so it isn't necessary.
let restartCallback;
abglobal.restart = function(){
  do_print("Rebooting");
  restartCallback();
};

// Set the function to be called when AddonBisector tries to reboot.
function setRestartCallback(cb) {
  if (!cb) cb = function(){};

  restartCallback = cb;
}
setRestartCallback();

// Turn a number into an addon name.
function addonName(num) {
  return "test_AddonBisector_"+num;
}
// Turn a number into an addon id.
function addonID(num) {
  return "test_AddonBisector_"+num+"@tests.mozilla.org"
}

let installedAddons = 0;

// Ensure the addons up to num are installed then call cb.
function installUpTo(num, cb) {
  let pending = installedAddons; // Goes from installedAddons to num.

  if (num < installedAddons)
    do_throw("You can only install new addons, removing is not supported!");

  function installFailed(install) {
    do_throw("Error installing addons, could not test!");
  }

  let installListener = {
    onInstallEnded: function(install, addon){
      pending++;

      if (pending == num) cb();
    },
    onInstallCanceled: installFailed,
    onInstallFailed: installFailed,
  };

  while (installedAddons < num) {
    installedAddons++;
    let addon = addonName(installedAddons);

    AddonManager.getInstallForFile(do_get_addon(addon), function(install){
      install.addListener(installListener);
      install.install();
    });
  }

  if (pending == num) cb(); // If none were installed.
}

let driverstate = {};

/**
 * Run a bisection test.
 *
 * @param  cb
 *         Function to call when finished.
 * @param  num
 *         The number of addons to have installed.  (Add addons up to this
 *         number will be installed).
 * @param  target
 *         The number of the addon to find guilty.
 * @param  bad
 *         Either false to always be bad (ie. firefox guilty), or an array of
 *         addons that cause a bad state when enabled.
 * @param  disabled
 *         An optional array of addons to disable before calling
 *         AddonBisector.start().
 * @param  opt
 *         An optional options object that will be passed to
 *         AddonBisector.start().
 */
function runBisectionTest(cb, num, target, bad, disabled, opt) {
  if (typeof disabled != "object") disabled = [];

  driverstate.callback = cb;
  if (opt && opt.all) driverstate.numAddons = num;
  else                driverstate.numAddons = num - disabled.length;
  driverstate.target = target && addonID(target); // ID or undefined.
  driverstate.badAddons = bad && bad.map(addonID);

  driverstate.runs = 0;

  driverstate.badAddonRes = []; // Bad addons, as per AddonBisector.badAddons
  driverstate.goodAddons = []; // Good Addons
  driverstate.allAddons = [];  // All enabled addons.
  for (let i = 1; i <= num; i++) {
    if ((!opt || !opt.all) && disabled.indexOf(i) >= 0) continue; // Skip disabled addons.

    let id = addonID(i);

    driverstate.allAddons.push(id); // Enabled, so add.

    if (bad && bad.indexOf(i) >= 0) driverstate.badAddonRes.push(id); // Bad.
    else                            driverstate.goodAddons.push(id);  // Otherwise good.
  }

  do_print("Starting bisection of "+driverstate.numAddons+" addons ("+num+" installed).");
  do_print("Looking for "+(target?target:"firefox")+".");

  let disabledmap = {};
  disabled.forEach(function(id){
    disabledmap[addonID(id)] = true;
  });

  installUpTo(num, function(){
    AddonManager.getAllAddons(function(addons){
      addons.forEach(function(addon){
        dump(addon.id+" - "+(!!disabledmap[addon.id])+"\n");
        addon.userDisabled = !!disabledmap[addon.id];
      });

      AddonBisector.init(function(){
        do_check_seq(AddonBisector.state, AddonBisector.STATE_NONE);
        do_check_seq(AddonBisector.runs, undefined);
        do_check_seq(AddonBisector.badAddons, undefined);
        do_check_seq(AddonBisector.goodAddons, undefined);
        do_check_seq(AddonBisector.unknownAddons, undefined);

        AddonBisector.start(driver_first, opt);
      });
    });
  });
};

// Called after the first reboot.
function driver_first(cont){
  if (driverstate.numAddons == 0) { // If you have no addons, blame firefox immediately.
    do_check_eq(AddonBisector.state, AddonBisector.STATE_DONE);
    do_check_seq(AddonBisector.runs, 0);
    do_check_matches([], AddonBisector.badAddons);
    do_check_matches(driverstate.goodAddons, AddonBisector.goodAddons.sort());
    do_check_matches([], AddonBisector.unknownAddons);

    setRestartCallback(driver_done);
  } else { // Otherwise we should have all disabled to test firefox.
    do_check_eq(AddonBisector.state, AddonBisector.STATE_RUNNING);
    do_check_seq(AddonBisector.runs, 0);
    do_check_seq(AddonBisector.badAddons, undefined);
    do_check_matches([], AddonBisector.goodAddons);
    do_check_matches(driverstate.allAddons, AddonBisector.unknownAddons.sort());

    setRestartCallback(driver_mark);
  }

  cont();
};

// Called after reboots after the first.
function driver_next(cont){
  //AddonBisector.dumpDebugInfo();

  driverstate.runs++;
  do_check_seq(AddonBisector.runs, driverstate.runs);

  if (AddonBisector.state == AddonBisector.STATE_DONE) {
    do_check_matches(driverstate.badAddonRes, AddonBisector.badAddons.sort());
    do_check_matches(driverstate.goodAddons, AddonBisector.goodAddons.sort());
    do_check_matches([], AddonBisector.unknownAddons);

    setRestartCallback(driver_done);
  } else { // Nothing special, do another iteration.
    do_check_eq(AddonBisector.state, AddonBisector.STATE_RUNNING);
    do_check_seq(AddonBisector.badAddons, undefined);
    do_check_matches(driverstate.AllAddons, AddonBisector.goodAddons.concat(AddonBisector.unknownAddons).sort());

    setRestartCallback(driver_mark);
  }

  cont();
};

// Check good or bad and call AddonBisector.mark() appropriately.
function driver_mark() {
  do_check_eq(AddonBisector.state, AddonBisector.STATE_RUNNING);
  do_check_seq(AddonBisector.badAddons, undefined);
  do_check_matches(driverstate.AllAddons, AddonBisector.goodAddons.concat(AddonBisector.unknownAddons).sort());

  if (!driverstate.badAddons) AddonBisector.mark(driver_next, false);
  else {
    AddonManager.getAddonsByIDs(driverstate.badAddons, function(addons){
      var good = true;
      addons.forEach(function(addon){
        if (addon.isActive) good = false;
      });
      AddonBisector.mark(driver_next, good);
    });
  }
};

// Called from last restart handler. Cleans up this test.
function driver_done(){
  do_check_eq(AddonBisector.state, AddonBisector.STATE_NONE);
  do_check_seq(AddonBisector.runs, undefined);
  do_check_seq(AddonBisector.badAddons, undefined);
  do_check_seq(AddonBisector.goodAddons, undefined);
  do_check_seq(AddonBisector.unknownAddons, undefined);

  let cb = driverstate.callback;
  driverstate = {};

  setRestartCallback();
  cb();
};

// Create a test with the given options and cue it to run.
function make_and_run_test(num, target, bad, disabled, opt) {
  if (typeof bad != "object") bad = target?[target]:false;

  add_test(function(){
    runBisectionTest(run_next_test, num, target, bad, disabled, opt);
  });
}

// Entry point, start async test list.
function run_test() {
  run_next_test();
}

// Basic tests, find the bad addon.
make_and_run_test(0, undefined);
make_and_run_test(1, 1);
make_and_run_test(1, undefined);
make_and_run_test(2, 1);
make_and_run_test(2, 2);
make_and_run_test(2, undefined);
make_and_run_test(3, 1);
make_and_run_test(3, 2);
make_and_run_test(3, 3);
make_and_run_test(3, undefined);
make_and_run_test(4, 1);
make_and_run_test(4, 2);
make_and_run_test(4, 4);
make_and_run_test(4, undefined);
make_and_run_test(5, 1);
make_and_run_test(5, 2);
make_and_run_test(5, 4);
make_and_run_test(5, 5);
make_and_run_test(5, undefined);

// Check that disabled addons are not tested.
make_and_run_test(5, 1, [1,3], [3]);
make_and_run_test(5, 3, [1,3], [1]);
make_and_run_test(5, undefined, [5], [1,2,3,4,5]);
make_and_run_test(5, 4, [1,2,3,4,5], [1,2,3,5]);

// Expect when opt.all is set in which case all addons are tested.
make_and_run_test(5, 3, [3], [3,4,5], {all:true});
make_and_run_test(5, 2, [2], [2,3], {all:true});
