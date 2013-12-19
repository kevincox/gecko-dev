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

let al;
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
  al.appendChild(ti);
}

function addAddonItems(addons, good) {
  for (let i in addons) {
    addAddonItem(addons[i], good);
  }
}

function updateStats() {
  while (al.childNodes.length) al.removeChild(al.childNodes[0]); // Clear list.

  document.getElementById("stats").hidden = false;

  document.getElementById("num-left").value = AddonBisector.unknownAddons.length;

  AddonManager.getAddonsByIDs(AddonBisector.unknownAddons, function(as){
    addAddonItems(as, false);
  });
  AddonManager.getAddonsByIDs(AddonBisector.goodAddons, function(as){
    addAddonItems(as, true);
  });
}

function init() {
  al = document.getElementById("addons");

  if (AddonBisector.state != AddonBisector.STATE_NONE) {
    document.getElementById("ongoing").hidden = false;
    updateStats();
  } else {
    document.getElementById("noongoing").hidden = false;
  }
}

function start() {
  AddonBisector.start(callback);
}

function mark(allegiance) {
  AddonBisector.mark(callback, allegiance);
}

var cont = function(){alert("This shouldn't appear.")};

function callback(c) {
  cont = c;

  document.getElementById("ongoing"  ).hidden = true;
  document.getElementById("noongoing").hidden = true;

  if (AddonBisector.state == AddonBisector.STATE_DONE) {
    document.getElementById("stats").hidden = true;
    document.getElementById("done").hidden = false;

    if (AddonBisector.badAddons.length) {
      AddonManager.getAddonByID(AddonBisector.badAddons[0], function(a) {
        document.getElementById("bad-icon").setAttribute("src", a.iconURL);
        document.getElementById("bad-name").value = a.name;
      });
    } else {
      document.getElementById("bad-icon").setAttribute("src", "chrome://branding/content/icon64.png");
      document.getElementById("bad-name").value = Services.appinfo.name;
    }
  } else {
    document.getElementById("next").hidden = false;
    updateStats();
  }
}
