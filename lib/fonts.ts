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
