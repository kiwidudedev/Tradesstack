import localFont from "next/font/local";

export const akzidenz = localFont({
  src: [
    { path: "../public/fonts/AkzidenzGrotesk-Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/AkzidenzGrotesk-Medium.ttf", weight: "500", style: "normal" },
    { path: "../public/fonts/AkzidenzGrotesk-Bold.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
  variable: "--font-akzidenz",
});

export const akzidenzBlack = localFont({
  src: [{ path: "../public/fonts/AkzidenzGrotesk-Bold.ttf", weight: "900", style: "normal" }],
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
  variable: "--font-akzidenz-black",
});

export const bertholdHeading = localFont({
  src: [{ path: "../public/fonts/Berthold-Akzidenz-Grotesk-Bold-Condensed.otf", weight: "700", style: "normal" }],
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
  variable: "--font-berthold-heading",
});

export const bertholdExtraBoldCondensed = localFont({
  src: [{ path: "../public/fonts/Berthold-Akzidenz-Grotesk-Bold-Condensed.otf", weight: "800", style: "normal" }],
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
  variable: "--font-berthold-extra-bold-condensed",
});

export const interMedium = localFont({
  src: [{ path: "../public/fonts/inter/inter-latin-500-normal.woff2", weight: "500", style: "normal" }],
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  variable: "--font-inter-medium",
});

export const interBold = localFont({
  src: [{ path: "../public/fonts/inter/inter-latin-700-normal.woff2", weight: "700", style: "normal" }],
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  variable: "--font-inter-bold",
});

export const mulishBody = localFont({
  src: [
    { path: "../public/fonts/mulish/mulish-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/mulish/mulish-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/mulish/mulish-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/mulish/mulish-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  variable: "--font-body",
});

export const mulishHeading = localFont({
  src: [
    { path: "../public/fonts/mulish/mulish-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/mulish/mulish-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/mulish/mulish-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/mulish/mulish-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  variable: "--font-heading",
});
