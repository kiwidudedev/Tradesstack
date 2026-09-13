import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function QAFormContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-4xl", className)}>{children}</div>;
}

export function QAFormIdentity({
  name,
  description,
  eyebrow = "QA form",
  sourceText,
  trailing,
}: {
  name: string;
  description?: string;
  eyebrow?: string;
  sourceText?: string | null;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{eyebrow}</p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{name || "Untitled QA"}</h1>
        {description ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p> : null}
        {sourceText ? <p className="mt-2 text-xs text-[var(--text-muted)]">{sourceText}</p> : null}
      </div>
      {trailing}
    </div>
  );
}

