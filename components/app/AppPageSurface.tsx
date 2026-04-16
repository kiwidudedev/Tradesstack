"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function AppPageSurface({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const tagFirstCard = () => {
      root.querySelectorAll<HTMLElement>(".app-page-header-card").forEach((node) => {
        node.classList.remove("app-page-header-card");
      });

      const firstCard = root.querySelector<HTMLElement>(".ui-card");
      if (firstCard) {
        firstCard.classList.add("app-page-header-card");
      }
    };

    tagFirstCard();

    const observer = new MutationObserver(() => {
      tagFirstCard();
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [pathname]);

  return (
    <div ref={rootRef} className="app-page-surface min-h-full">
      {children}
    </div>
  );
}
