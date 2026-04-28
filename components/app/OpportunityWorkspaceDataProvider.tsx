"use client";

import { createContext, useContext } from "react";
import type { OpportunityWorkspaceData } from "@/lib/opportunity-workspace";

const OpportunityWorkspaceDataContext = createContext<OpportunityWorkspaceData | null>(null);

export function OpportunityWorkspaceDataProvider({
  data,
  children,
}: {
  data: OpportunityWorkspaceData;
  children: React.ReactNode;
}) {
  return (
    <OpportunityWorkspaceDataContext.Provider value={data}>
      {children}
    </OpportunityWorkspaceDataContext.Provider>
  );
}

export function useOpportunityWorkspaceData() {
  const context = useContext(OpportunityWorkspaceDataContext);

  if (!context) {
    throw new Error("useOpportunityWorkspaceData must be used within OpportunityWorkspaceDataProvider.");
  }

  return context;
}
