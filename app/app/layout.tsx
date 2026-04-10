import { redirect } from "next/navigation";
import { AppPageSurface } from "@/components/app/AppPageSurface";
import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import { interBold, interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentOrganizationMember();

  if (!member) {
    redirect("/login");
  }

  return (
    <div className={`${interMedium.className} ${interBold.variable} app-shell app-canvas min-h-screen`}>
      <div
        className="mx-auto flex w-full max-w-[1760px] gap-0"
        style={{ background: "linear-gradient(90deg, #0E172B 0 240px, transparent 240px)" }}
      >
        <Sidebar />
        <main className="app-canvas min-w-0 flex-1 p-[0.384rem] sm:p-[1.024rem]">
          <Topbar />
          <AppPageSurface>{children}</AppPageSurface>
        </main>
      </div>
    </div>
  );
}
