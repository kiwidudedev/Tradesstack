import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { mulishBody, mulishHeading } from "@/lib/fonts";
import "@/styles/globals.css";

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
        className={`${mulishBody.variable} ${mulishHeading.variable} font-body antialiased`}
      >
        {process.env.NODE_ENV === "development" ? (
          <Script src="//unpkg.com/react-grab/dist/index.global.js" strategy="beforeInteractive" />
        ) : null}
        {children}
      </body>
    </html>
  );
}
