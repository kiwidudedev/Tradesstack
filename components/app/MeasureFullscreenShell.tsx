import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ibmPlexSans } from "@/lib/fonts";
import { Button } from "@/components/ui/button";

export function MeasureFullscreenShell({
  opportunityId,
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
      <div className="pointer-events-none absolute left-4 top-4 z-30 flex items-start gap-3">
        <Button
          asChild
          type="button"
          variant="outline"
          className="pointer-events-auto h-10 rounded-[10px] border-[#CBD5E1] bg-white/94 text-[#334155] shadow-[0_10px_28px_rgba(15,23,42,0.10)] backdrop-blur-sm hover:bg-white"
        >
          <Link href={`/app/leads-clients/opportunities/${opportunityId}/takeoff/quantities`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Exit Measure
          </Link>
        </Button>
        <div className="hidden rounded-full border border-white/75 bg-white/90 px-3 py-2 text-[12px] font-semibold text-[#475569] shadow-[0_10px_28px_rgba(15,23,42,0.10)] backdrop-blur-sm lg:block">
          {title}
        </div>
      </div>

      <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-[#FBFEFE]">{children}</div>
    </div>
  );
}
