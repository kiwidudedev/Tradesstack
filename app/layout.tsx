import type { Metadata, Viewport } from "next";
import { Mulish } from "next/font/google";
import Script from "next/script";
import "@/styles/globals.css";

const bodyFont = Mulish({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  fallback: ["Arial", "sans-serif"],
});

const headingFont = Mulish({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  weight: ["500", "600", "700", "800"],
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Tradesstack",
  description: "Tradesstack prototype app",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${bodyFont.variable} ${headingFont.variable} font-body antialiased`}
      >
        {process.env.NODE_ENV === "development" ? (
          <Script src="//unpkg.com/react-grab/dist/index.global.js" strategy="beforeInteractive" />
        ) : null}
        {children}
      </body>
    </html>
  );
}
