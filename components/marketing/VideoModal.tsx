"use client";

import { useEffect } from "react";

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VideoModal({ isOpen, onClose }: VideoModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8">
      <button type="button" aria-label="Close video modal" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded-2xl bg-[#04234D] shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <p className="text-sm font-semibold tracking-wide text-[#F74917]">TRADESTACK DEMO</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-black/20 px-3 py-1 text-sm text-[#F74917] hover:bg-black/5"
          >
            Close
          </button>
        </div>
        <div className="aspect-video w-full bg-[#0B1220]">
          {/* TODO: Replace with real TradesStack product demo embed URL */}
          <iframe
            className="h-full w-full"
            src="https://www.youtube.com/embed/dQw4w9WgXcQ"
            title="TradesStack demo placeholder"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
