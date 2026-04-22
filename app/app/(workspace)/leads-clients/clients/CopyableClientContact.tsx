"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ibmPlexSans } from "@/lib/fonts";

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
        className={`${ibmPlexSans.className} inline-flex items-center gap-1.5 rounded-[8px] px-1.5 py-1 text-[13px] text-[#4B5D79] transition hover:bg-[#EEF3F9] hover:text-[#10283B]`}
        title={`Copy ${label}`}
        aria-label={`Copy ${label}: ${value}`}
      >
        {children}
        <span>{value}</span>
      </button>
      <span
        aria-live="polite"
        className={`${ibmPlexSans.className} text-[12px] font-semibold ${copied ? "text-[#15803D]" : "text-transparent"}`}
      >
        Copied
      </span>
    </div>
  );
}
