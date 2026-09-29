import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { CORE_CONTRACTS_PACKAGE_VERSION } from "@tradesstack/core-contracts";
import { akzidenzProBoldEx, interMedium, mulishBody, mulishHeading } from "@/lib/fonts";
import { APPLICATION_SHELL_RELEASE } from "@/lib/application-shell-release";
import { getMasterClientConfig } from "@/lib/client-config";
import "@/styles/globals.css";

// Invisible reference-app consumption proof; this has no rendered or runtime product effect.
void CORE_CONTRACTS_PACKAGE_VERSION;
void APPLICATION_SHELL_RELEASE;

const clientConfig = getMasterClientConfig();

export const metadata: Metadata = {
  title: clientConfig.identity.displayName,
  description: clientConfig.identity.description,
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
