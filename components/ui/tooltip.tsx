"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type TooltipSide = "top" | "bottom" | "right" | "left";

interface TooltipProps {
  label: React.ReactNode;
  side?: TooltipSide;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ label, side = "bottom", children, className }: TooltipProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [position, setPosition] = React.useState<React.CSSProperties | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);

  const arrowPosition: Record<TooltipSide, string> = {
    bottom: "-top-1 left-1/2 -translate-x-1/2 border-b-0 border-r-0",
    top: "-bottom-1 left-1/2 -translate-x-1/2 border-t-0 border-l-0",
    right: "-left-1 top-1/2 -translate-y-1/2 border-r-0 border-b-0",
    left: "-right-1 top-1/2 -translate-y-1/2 border-l-0 border-t-0",
  };

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const gap = 8;

    if (side === "top") {
      setPosition({
        left: rect.left + rect.width / 2,
        top: rect.top - gap,
        transform: "translate(-50%, -100%)",
      });
      return;
    }

    if (side === "right") {
      setPosition({
        left: rect.right + gap,
        top: rect.top + rect.height / 2,
        transform: "translateY(-50%)",
      });
      return;
    }

    if (side === "left") {
      setPosition({
        left: rect.left - gap,
        top: rect.top + rect.height / 2,
        transform: "translate(-100%, -50%)",
      });
      return;
    }

    setPosition({
      left: rect.left + rect.width / 2,
      top: rect.bottom + gap,
      transform: "translateX(-50%)",
    });
  }, [side]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  const tooltip =
    isOpen && position && typeof document !== "undefined"
      ? createPortal(
          <span
            role="tooltip"
            style={position}
            className={cn(
              "pointer-events-none fixed z-[1000] whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[12px] font-medium text-[var(--text-primary)] shadow-[var(--shadow-md)]",
              className
            )}
          >
            {label}
            <span
              aria-hidden="true"
              className={cn(
                "absolute h-2 w-2 rotate-45 border border-[var(--border)] bg-[var(--surface)]",
                arrowPosition[side]
              )}
            />
          </span>,
          document.body
        )
      : null;

  return (
    <span
      ref={triggerRef}
      className="inline-flex"
      onMouseEnter={() => {
        updatePosition();
        setIsOpen(true);
      }}
      onMouseLeave={() => setIsOpen(false)}
      onFocusCapture={() => {
        updatePosition();
        setIsOpen(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      {children}
      {tooltip}
    </span>
  );
}
