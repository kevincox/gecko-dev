/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsContentCreatorFunctions.h"
#include "nsGkAtoms.h"
#include "nsMathMLElement.h"

using namespace mozilla::dom;

// MathML Element Factory (declared in nsContentCreatorFunctions.h)
nsresult
NS_NewMathMLElement(Element** aResult, already_AddRefed<nsINodeInfo> aNodeInfo)
{
  aNodeInfo.get()->SetIDAttributeAtom(nsGkAtoms::id);

  nsMathMLElement* it = new nsMathMLElement(aNodeInfo);

  NS_ADDREF(*aResult = it);
  return NS_OK;
}
