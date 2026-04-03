import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { akzidenzProBoldEx, interMedium, mulishBody, mulishHeading } from "@/lib/fonts";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Tradesstack",
  description: "Tradesstack prototype app",
  icons: {
    icon: [
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon-48.png",
    apple: "/favicon-512.png",
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
        className={`${akzidenzProBoldEx.variable} ${interMedium.variable} ${mulishBody.variable} ${mulishHeading.variable} font-body antialiased`}
      >
        {process.env.NODE_ENV === "development" ? (
          <Script src="//unpkg.com/react-grab/dist/index.global.js" strategy="beforeInteractive" />
        ) : null}
        {children}
      </body>
    </html>
  );
}
