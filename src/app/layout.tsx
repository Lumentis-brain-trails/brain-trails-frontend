import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/**
 * The brand face, used by the entry screen only (docs/DESIGN.md). Self-hosted by
 * next/font, so it costs no third-party request and cannot flash an unstyled name.
 */
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Brain Trails", template: "%s · Brain Trails" },
  description:
    "Turn an EEG recording into a trail through brain-state space. A LuMentis research prototype.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

/**
 * Root layout. The app runs on the system font stack (globals.css): the platform
 * face already ships optical sizing and tracking tables. Manrope rides alongside
 * as a CSS variable and is only picked up by `font-display`, on the entry screen.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${manrope.variable}`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
