import { AppShellFrame } from "@/components/app/AppShellFrame";
import { Sidebar } from "@/components/app/Sidebar";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[1760px] items-start gap-0">
      <div aria-hidden="true" className="absolute inset-y-0 left-0 hidden w-[240px] bg-[var(--sidebar)] lg:block" />
      <Sidebar />
      <AppShellFrame>{children}</AppShellFrame>
    </div>
  );
}
