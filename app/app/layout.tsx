import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import { interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentOrganizationMember();

  if (!member) {
    redirect("/login");
  }

  return (
    <div className={`${interMedium.className} square-cards min-h-screen bg-[#F7F9FC]`}>
      <div className="mx-auto flex w-full max-w-[1720px] gap-0">
        <Sidebar />
        <div className="min-w-0 flex-1 p-3 sm:p-8">
          <Topbar />
          {children}
        </div>
      </div>
    </div>
  );
}
