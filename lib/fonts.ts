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
  src: [{ path: "../public/Akzidenz-grotesk-black.ttf", weight: "900", style: "normal" }],
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
  variable: "--font-akzidenz-black",
});

export const akzidenzProBoldEx = localFont({
  src: [{ path: "../public/akzidenzgroteskpro_boldex.otf", weight: "700", style: "normal" }],
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
  variable: "--font-akzidenz-pro-boldex",
});

export const bertholdHeading = localFont({
  src: [{ path: "../public/fonts/AkzidenzGrotesk-Bold.ttf", weight: "700", style: "normal" }],
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
  variable: "--font-berthold-heading",
});

export const bertholdExtraBoldCondensed = localFont({
  src: [{ path: "../public/Akzidenz-grotesk-black.ttf", weight: "800", style: "normal" }],
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

export const ibmPlexSans = localFont({
  src: [
    { path: "../public/fonts/ibm plex sans/IBMPlexSans-Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/ibm plex sans/IBMPlexSans-Medium.ttf", weight: "500", style: "normal" },
    { path: "../public/fonts/ibm plex sans/IBMPlexSans-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../public/fonts/ibm plex sans/IBMPlexSans-Bold.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  variable: "--font-ibm-plex-sans",
});

export const mulishBody = localFont({
  src: [
    { path: "../public/fonts/inter/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/inter/inter-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  variable: "--font-body",
});

export const mulishHeading = localFont({
  src: [
    { path: "../public/fonts/inter/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/inter/inter-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  variable: "--font-heading",
});
