"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type CopyableClientContactProps = {
  label: string;
  value: string;
  children: ReactNode;
};

export function CopyableClientContact({ label, value, children }: CopyableClientContactProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={copyValue}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
        title={`Copy ${label}`}
        aria-label={`Copy ${label}: ${value}`}
      >
        {children}
        <span>{value}</span>
      </button>
      <span
        aria-live="polite"
        className={`text-xs font-semibold ${copied ? "text-[var(--success)]" : "text-transparent"}`}
      >
        Copied
      </span>
    </div>
  );
}
