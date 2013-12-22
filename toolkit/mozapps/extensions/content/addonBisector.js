// -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
// vim: set ts=2 sw=2 et:

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {classes:Cc, interfaces:Ci, results:Cr, utils:Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/AddonBisector.jsm");

let addonStatsTree;
function addAddonItem(addon, good) {
  let ti = document.createElement("treeitem");
  let tr = document.createElement("treerow");
  let tc;

  tc = document.createElement("treecell");
  tc.setAttribute("value", good);
  tr.appendChild(tc);

  tc = document.createElement("treecell");
  tc.setAttribute("value", addon.isActive);
  tr.appendChild(tc);

  tc = document.createElement("treecell");
  tr.appendChild(tc);
  tc.setAttribute("label", addon.name);

  ti.appendChild(tr);
  addonStatsTree.appendChild(ti);
}

function addAddonItems(addons, good) {
  for (let i in addons) {
    addAddonItem(addons[i], good);
  }
}

function clearAddonItems() {
  while (addonStatsTree.childNodes.length)
    addonStatsTree.removeChild(al.childNodes[0]); // Clear list.
}

function updateStats() {
  clearAddonItems();

  document.getElementById("stats").hidden = false;

  AddonManager.getAddonsByIDs(AddonBisector.unknownAddons, function(as){
    addAddonItems(as, false);
  });
  AddonManager.getAddonsByIDs(AddonBisector.goodAddons, function(as){
    addAddonItems(as, true);
  });
}

// Entry point on window open.
function init() {
  AddonBisector.init(function(){
    addonStatsTree = document.getElementById("addons");

    if (AddonBisector.state != AddonBisector.STATE_NONE) {
      document.getElementById("ongoing").hidden = false;
      document.getElementById("abort").hidden = false;
      updateStats();
    } else {
      document.getElementById("noongoing").hidden = false;
    }
  });
}

function start() {
  AddonBisector.start(callback);
}

function mark(allegiance) {
  AddonBisector.mark(callback, allegiance);
}

function abort() {
  AddonBisector.abort();
}

// Callback for restarting browser.
// Will come from AddonBisector as a parameter to a callback.
var cont = function(){alert("This shouldn't appear.")};

function callback(c) {
  cont = c;

  document.getElementById("ongoing"  ).hidden = true;
  document.getElementById("noongoing").hidden = true;

  if (AddonBisector.state == AddonBisector.STATE_DONE) {
    // The bad addon has been found!  Hide the progress things and reveal the
    // faulty addon.
    document.getElementById("stats").hidden = true;
    document.getElementById("abort").hidden = true;
    document.getElementById("done").hidden = false;

    if (AddonBisector.badAddons.length) {
      AddonManager.getAddonByID(AddonBisector.badAddons[0], function(a) {
        document.getElementById("bad-icon").setAttribute("src", a.iconURL);
        document.getElementById("bad-name").value = a.name;
      });
    } else { // If there are no addons at fault it is a Firefox issue.
      document.getElementById("bad-icon").setAttribute("src", "chrome://branding/content/icon64.png");
      document.getElementById("bad-name").value = Services.appinfo.name;
    }
  } else { // Not done, show next button.
    document.getElementById("next").hidden = false;
    updateStats();
  }
}
