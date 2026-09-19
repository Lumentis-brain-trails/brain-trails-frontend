import Link from "next/link";
import { CornerRibbons } from "@/components/CornerRibbons";

/**
 * The auth flow stays in the entry screen's room: the same dark ground, the same
 * ribbons (tucked a little further into their corners so the form has the middle),
 * the name in the brand face. The subtree pins `data-theme="dark"`, so every
 * primitive inside resolves the dark tokens whatever appearance the app is in.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-theme="dark"
      className="relative isolate flex min-h-[100svh] flex-col bg-[#04060b] text-ink"
    >
      <CornerRibbons
        retreat={0.1}
        className="fixed inset-0 -z-10 h-full w-full"
      />
      <header className="flex h-16 w-full items-center justify-between px-6 md:px-10">
        <Link
          href="/"
          className="font-display text-[20px] font-bold tracking-[-0.02em]"
        >
          Braintrails
        </Link>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="font-display flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 pt-6 pb-5 text-[11px] tracking-[0.15em] text-[#56607a] uppercase">
        <span>Non-clinical prototype</span>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="hover:text-ink-2">
          privacy
        </Link>
      </footer>
    </div>
  );
}
