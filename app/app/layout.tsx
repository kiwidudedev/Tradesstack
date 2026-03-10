import { Inter } from "next/font/google";
import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";

const interMedium = Inter({
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

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
