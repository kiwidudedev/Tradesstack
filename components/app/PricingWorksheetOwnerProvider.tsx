"use client";

import { createContext, useContext } from "react";
import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";

const PricingWorksheetOwnerContext = createContext<PricingWorksheetOwnerContextValue | null>(null);

export function PricingWorksheetOwnerProvider({
  owner,
  children,
}: {
  owner: PricingWorksheetOwnerContextValue;
  children: React.ReactNode;
}) {
  return (
    <PricingWorksheetOwnerContext.Provider value={owner}>
      {children}
    </PricingWorksheetOwnerContext.Provider>
  );
}

export function usePricingWorksheetOwner() {
  const context = useContext(PricingWorksheetOwnerContext);

  if (!context) {
    throw new Error("usePricingWorksheetOwner must be used within PricingWorksheetOwnerProvider.");
  }

  return context;
}
