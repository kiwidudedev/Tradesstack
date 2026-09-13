import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { QASectionDefinition } from "@/lib/quality-assurance/definitions/types";

export type QAPresentableSection = Pick<QASectionDefinition, "id" | "title" | "description">;

export function QASectionPresentation({
  section,
  sectionIndex,
  children,
  headerAction,
  headerSelection,
  className,
}: {
  section: QAPresentableSection;
  sectionIndex: number;
  children: ReactNode;
  headerAction?: ReactNode;
  headerSelection?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="relative rounded-[var(--radius-md)]">
        {headerSelection}
        <div className={cn("min-w-0", headerSelection && "pointer-events-none px-1 py-1 pr-12")}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Section {sectionIndex + 1}</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{section.title || "Untitled section"}</h2>
          {section.description ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{section.description}</p> : null}
        </div>
        {headerAction ? <div className="absolute right-0 top-0 z-20">{headerAction}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

