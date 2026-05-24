import { redirect } from "next/navigation";
import { interBold, interMedium } from "@/lib/fonts";
import { isPlatformAdmin } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentOrganizationMember();
  const platformAdmin = member ? false : await isPlatformAdmin();

  if (!member && !platformAdmin) {
    redirect("/login");
  }

  return (
    <div className={`${interMedium.className} ${interBold.variable} app-shell app-canvas min-h-screen bg-[var(--app-canvas)]`}>{children}</div>
  );
}
