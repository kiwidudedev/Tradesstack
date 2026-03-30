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
    <div className={`${interMedium.className} ${interBold.variable} min-h-screen bg-[#F8F9FC]`}>
      <div className="mx-auto flex w-full max-w-[1720px] gap-0">
        <Sidebar />
        <div className="min-w-0 flex-1 bg-[#F9F8F6] p-3 sm:p-8">
          <Topbar />
          <AppPageSurface>{children}</AppPageSurface>
        </div>
      </div>
    </div>
  );
}
