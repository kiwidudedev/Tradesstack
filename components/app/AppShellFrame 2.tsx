"use client";

import { AppPageSurface } from "@/components/app/AppPageSurface";
import { Topbar } from "@/components/app/Topbar";

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-w-0 flex-1 bg-[#FBFEFE] p-[0.384rem] sm:p-[1.024rem]">
      <Topbar />
      <AppPageSurface>{children}</AppPageSurface>
    </main>
  );
}
