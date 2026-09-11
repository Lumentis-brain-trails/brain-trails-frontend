import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

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
 * Root layout. The system font stack is set in globals.css on purpose: the
 * platform face already ships optical sizing and tracking tables, and it keeps
 * the build free of a font-download step.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
