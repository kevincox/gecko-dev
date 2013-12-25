/* -*- Mode: javascript; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ft=javascript ts=2 sts=2 et sw=2: */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests AddonBisector.jsm

"use strict";

Components.utils.import("resource://gre/modules/AddonManager.jsm");
createAppInfo("xpcshell@tests.mozilla.org", "XPCShell", "1", "1.9");
startupManager();

let abglobal = Components.utils.import("resource://gre/modules/AddonBisector.jsm");

//abglobal.setTimeout = function(f,d){do_timeout(d,f)};

let restartCallback;
abglobal.restart = function(){
  restartCallback();
};
function setRestartCallback(cb) {
  if (!cb) cb = function(){};

  restartCallback = cb;
}
setRestartCallback();

function addonName(num) {
  return "test_AddonBisector_"+num;
}
function addonID(num) {
  return "test_AddonBisector_"+num+"@tests.mozilla.org"
}

let installedAddons = 0;

function installUpTo(num, cb) {
  let pending = installedAddons; // Goes from installedAddons to num.

  if (num < installedAddons)
    do_throw("You and only install new addons, removing is not supported!");

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

function runBisectionTest(cb, num, target) {
  driverstate.callback = cb;
  driverstate.numAddons = num;
  driverstate.target = target && addonID(target); // ID or undefined.

  do_print("Starting bisection of "+num+" addons.");
  do_print("Looking for "+(target?target:"firefox")+".");

  do_check_eq(AddonBisector.state, AddonBisector.STATE_NONE);

  AddonBisector.init(function(){
    installUpTo(driverstate.numAddons, driver_start)
  });
};
function driver_start(){
  AddonBisector.start(driver_first);
};
function driver_first(cont){
  if (driverstate.numAddons == 0) {
    do_check_eq(AddonBisector.state, AddonBisector.STATE_DONE);
    do_check_eq(typeof AddonBisector.badAddons, "object");
    do_check_eq(AddonBisector.badAddons.length, 0);

    setRestartCallback(driver_done);
  } else {
    do_check_eq(AddonBisector.state, AddonBisector.STATE_RUNNING);
    do_check_eq(AddonBisector.badAddons, undefined);

    // Instead of restarting, just call us back.
    setRestartCallback(driver_mark);
  }

  cont();
};

function driver_next(cont){
  if (AddonBisector.state == AddonBisector.STATE_DONE) {
    do_check_eq(typeof AddonBisector.badAddons, "object");

    if (driverstate.target === undefined) do_check_eq(AddonBisector.badAddons.length, 0);
    else {
      do_check_eq(AddonBisector.badAddons.length, 1);
      do_check_eq(AddonBisector.badAddons[0], driverstate.target);
    }
    setRestartCallback(driver_done);
  } else {
    setRestartCallback(driver_mark);
  }

  cont();
};
function driver_mark(){
  if (driverstate.target === undefined) AddonBisector.mark(driver_next, false);
  else {
    AddonManager.getAddonByID(driverstate.target, function(addon){
      AddonBisector.mark(driver_next, !addon.isActive);
    });
  }
};
function driver_done(){
  do_check_eq(AddonBisector.state, AddonBisector.STATE_NONE);
  setRestartCallback();
  driverstate.callback();
};

function make_and_run_test(num, target) {
  add_test(function(){
    runBisectionTest(run_next_test, num, target);
  });
}

function run_test() {
  run_next_test();
}

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
