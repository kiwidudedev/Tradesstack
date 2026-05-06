import type { CSSProperties, ReactNode } from "react";
import { ibmPlexSans } from "@/lib/fonts";

export function MeasureFullscreenShell({
  title,
  children,
}: {
  opportunityId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`${ibmPlexSans.variable} ${ibmPlexSans.className} project-theme relative flex h-full min-h-0 w-full flex-1 overflow-hidden bg-[#FBFEFE]`}
      style={{ "--app-canvas": "#FBFEFE" } as CSSProperties}
    >
      <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-[#FBFEFE]">{children}</div>
    </div>
  );
}
