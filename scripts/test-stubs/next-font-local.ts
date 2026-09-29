// Vitest-only stand-in for next/font/local. Production builds use Next's real
// font loader; unit tests need only stable class/style metadata.
export default function localFont() {
  return { className: "test-font", style: { fontFamily: "test-font" }, variable: "--font-test" };
}
