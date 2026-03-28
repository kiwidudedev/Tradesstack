"use client";

import { useEffect, useState } from "react";

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setIsVisible(window.scrollY > window.innerHeight * 0.9);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      aria-label="Scroll to top"
      onClick={handleClick}
      className={`fixed bottom-5 right-5 z-40 inline-flex h-[72px] w-[72px] items-center justify-center rounded-full border-[5px] border-[#AACFDF] bg-[#0B2639] shadow-[0_16px_30px_rgba(11,38,57,0.18)] transition-all duration-200 sm:bottom-7 sm:right-7 sm:h-[82px] sm:w-[82px] ${
        isVisible ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-8 w-8 sm:h-9 sm:w-9"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M6 15L12 9L18 15" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="square" strokeLinejoin="miter" />
      </svg>
    </button>
  );
}
