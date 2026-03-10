import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import { interMedium } from "@/lib/fonts";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${interMedium.className} square-cards min-h-screen bg-[#F7F9FC]`}>
      <div className="mx-auto flex w-full max-w-[1720px] gap-0">
        <Sidebar />
        <div className="min-w-0 flex-1 p-6 sm:p-8">
          <Topbar />
          {children}
        </div>
      </div>
    </div>
  );
}
