"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "@/components/app/trade-pack-builder.module.css";
import { interMedium } from "@/lib/fonts";

export function ClaimLineTableShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <section className="border-b border-[var(--border-subtle)] py-5">
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="flex min-w-0 flex-1 items-center justify-between text-left"
            aria-expanded={isOpen}
          >
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>
              {title}
            </h2>
            <ChevronDown
              className={`mr-2 h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsExpanded(true)}
              className={`${styles.quoteButtonLabel} h-9 rounded-full border-[var(--border)] bg-[var(--surface-muted)] px-4`}
            >
              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
              Expand
            </Button>
          </div>
        </div>
        {isOpen ? <div className="mt-4 space-y-4">{children}</div> : null}
      </section>

      {isExpanded ? (
        <div className="fixed inset-0 z-[240] bg-[var(--navy-primary)]/55 p-4 sm:p-6">
          <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col rounded-[18px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
              <h2 className={styles.quoteSectionTitle}>{title}</h2>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsExpanded(false)}
                className={`${styles.quoteButtonLabel} h-9 rounded-full border-[var(--border)] bg-[var(--surface-muted)] px-4`}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
