import { redirect } from "next/navigation";
import { interBold, interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentOrganizationMember();

  if (!member) {
    redirect("/login");
  }

  return (
    <div className={`${interMedium.className} ${interBold.variable} app-shell app-canvas min-h-screen bg-[#FBFEFE]`}>{children}</div>
  );
}
